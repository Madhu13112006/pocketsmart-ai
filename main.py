"""PocketSmart AI: Your Smart Budget & Recommendation Assistant.

FastAPI application wiring together JWT auth, in-memory sessions, three
Gemini-powered budget planners (home interior, party, jewelry), and a
per-user recommendation history.
"""
import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import google.generativeai as genai
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Optional

from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    active_sessions,
    authenticate_user,
    blacklisted_tokens,
    create_access_token,
    create_session,
    decode_access_token,
    end_session,
    get_password_hash,
    get_token,
    touch_session,
    users_db,
)
from gemini_utils import (
    get_home_recommendations,
    get_jewelry_recommendations,
    get_party_recommendations,
    save_to_history,
    save_upload_file,
    user_recommendations,
)
from models import HomeBudgetInput, JewelryBudgetInput, PartyBudgetInput, RegisterUser

# ---------- Initialization ----------

load_dotenv()

API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not API_KEY or API_KEY == "your_google_gemini_api_key_here":
    print(
        "WARNING: GOOGLE_API_KEY is not set in .env. Gemini calls will fail and "
        "every planner will fall back to static recommendations."
    )
else:
    genai.configure(api_key=API_KEY)

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(cleanup_expired_sessions())
    yield


app = FastAPI(title="PocketSmart: AI Budget Planner", lifespan=lifespan)

SECRET_KEY = os.getenv("SECRET_KEY", "your_secret_key")
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

# Adjust in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

templates = Jinja2Templates(directory="templates")

os.makedirs("static/uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ---------- Auth dependencies ----------

def get_current_user(request: Request) -> Optional[str]:
    """Returns the username for a valid, non-blacklisted token, or None."""
    token = get_token(request)
    if not token:
        return None
    username = decode_access_token(token)
    if not username:
        return None
    touch_session(username)
    return username


def get_current_active_user(request: Request) -> str:
    """Same as get_current_user but raises 401 if there is no valid session."""
    username = get_current_user(request)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return username


def require_page_auth(request: Request) -> Optional[RedirectResponse]:
    """For HTML pages: returns a redirect to /login if not authenticated, else None."""
    username = get_current_user(request)
    if not username:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    return None


# ---------- Pages ----------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if get_current_user(request):
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    if get_current_user(request):
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse("register.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    username = get_current_user(request)
    if not username:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    user = users_db[username]
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user})


@app.get("/home-planner", response_class=HTMLResponse)
async def home_planner_page(request: Request):
    redirect = require_page_auth(request)
    if redirect:
        return redirect
    return templates.TemplateResponse("home_planner.html", {"request": request})


@app.get("/party-planner", response_class=HTMLResponse)
async def party_planner_page(request: Request):
    redirect = require_page_auth(request)
    if redirect:
        return redirect
    return templates.TemplateResponse("party_planner.html", {"request": request})


@app.get("/jewelry-planner", response_class=HTMLResponse)
async def jewelry_planner_page(request: Request):
    redirect = require_page_auth(request)
    if redirect:
        return redirect
    return templates.TemplateResponse("jewelry_planner.html", {"request": request})


@app.get("/history", response_class=HTMLResponse)
async def history_page(request: Request):
    redirect = require_page_auth(request)
    if redirect:
        return redirect
    return templates.TemplateResponse("history.html", {"request": request})


# ---------- Auth routes ----------

@app.post("/register")
async def register(user: RegisterUser):
    if user.username in users_db:
        raise HTTPException(status_code=400, detail="Username already registered")
    for existing in users_db.values():
        if existing["email"] == user.email:
            raise HTTPException(status_code=400, detail="Email already registered")

    users_db[user.username] = {
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "hashed_password": get_password_hash(user.password),
        "disabled": False,
    }
    return {"message": "User registered successfully", "username": user.username}


@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user["username"]})
    create_session(user["username"], access_token)

    response = JSONResponse(content={"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
    )
    return response


@app.post("/logout")
async def logout(request: Request):
    token = get_token(request)
    username = get_current_user(request)
    if username and token:
        end_session(username, token)

    response = RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    response.delete_cookie("access_token")
    return response


# ---------- Session routes ----------

@app.get("/session-info")
async def session_info(username: str = Depends(get_current_active_user)):
    session = active_sessions.get(username)
    if not session:
        raise HTTPException(status_code=404, detail="No active session found")

    duration_minutes = (session.last_activity - session.login_time).total_seconds() / 60
    return {
        "username": session.username,
        "login_time": session.login_time.isoformat(),
        "last_activity": session.last_activity.isoformat(),
        "session_duration": round(duration_minutes, 2),
        "user_data": session.user_data,
    }


@app.post("/session-data")
async def update_session_data(data: dict, username: str = Depends(get_current_active_user)):
    session = active_sessions.get(username)
    if not session:
        raise HTTPException(status_code=404, detail="No active session found")

    session.user_data.update(data)
    session.last_activity = datetime.now(timezone.utc)
    return {"message": "Session data updated", "user_data": session.user_data}


# ---------- Planner APIs ----------

@app.post("/home-budget")
async def home_budget(
    budget_input: HomeBudgetInput, username: str = Depends(get_current_active_user)
):
    session = active_sessions.get(username)
    if session:
        session.user_data["last_home_budget"] = budget_input.model_dump()

    result = get_home_recommendations(budget_input)
    save_to_history(username, "home", budget_input.model_dump(), result)
    return result


@app.post("/party-budget")
async def party_budget(
    budget_input: PartyBudgetInput, username: str = Depends(get_current_active_user)
):
    session = active_sessions.get(username)
    if session:
        session.user_data["last_party_budget"] = budget_input.model_dump()

    result = get_party_recommendations(budget_input)
    save_to_history(username, "party", budget_input.model_dump(), result)
    return result


@app.post("/jewelry-budget")
async def jewelry_budget(
    total_budget: float = Form(...),
    occasion: str = Form(...),
    preferences: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    username: str = Depends(get_current_active_user),
):
    budget_input = JewelryBudgetInput(
        total_budget=total_budget, occasion=occasion, preferences=preferences
    )

    image_path = None
    image_filename = None
    if image and image.filename:
        image_path = save_upload_file(image)
        image_filename = os.path.basename(image_path)

    session = active_sessions.get(username)
    if session:
        session.user_data["last_jewelry_budget"] = budget_input.model_dump()

    result = get_jewelry_recommendations(budget_input, image_path)

    history_input = budget_input.model_dump()
    if image_filename:
        history_input["image"] = image_filename
    save_to_history(username, "jewelry", history_input, result)
    return result


# ---------- History routes ----------

@app.get("/recommendation-history")
async def recommendation_history(username: str = Depends(get_current_active_user)):
    items = user_recommendations.get(username, [])
    sorted_items = sorted(items, key=lambda i: i.timestamp, reverse=True)
    return {
        "history": [
            {
                "id": i.id,
                "timestamp": i.timestamp,
                "type": i.recommendation_type,
                "input": i.input_summary,
                "summary": i.result_summary,
            }
            for i in sorted_items
        ]
    }


@app.get("/recommendation-details/{recommendation_id}")
async def recommendation_details(
    recommendation_id: str, username: str = Depends(get_current_active_user)
):
    items = user_recommendations.get(username, [])
    for item in items:
        if item.id == recommendation_id:
            return {
                "id": item.id,
                "timestamp": item.timestamp,
                "type": item.recommendation_type,
                "input": item.input_summary,
                "full_result": item.full_result,
            }
    raise HTTPException(status_code=404, detail="Recommendation not found")


# ---------- Lifecycle ----------

SESSION_IDLE_LIMIT_SECONDS = 1800
CLEANUP_INTERVAL_SECONDS = 300


async def cleanup_expired_sessions():
    """Background loop: removes sessions idle for more than 30 minutes."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        now = datetime.now(timezone.utc)
        expired = [
            username
            for username, session in active_sessions.items()
            if (now - session.last_activity).total_seconds() > SESSION_IDLE_LIMIT_SECONDS
        ]
        for username in expired:
            session = active_sessions.pop(username, None)
            if session:
                blacklisted_tokens.add(session.token)
            print(f"Cleaned up expired session for user: {username}")


if __name__ == "__main__":
    print("Starting PocketSmart: AI Budget Planner...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
