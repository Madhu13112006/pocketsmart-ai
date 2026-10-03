"""Authentication helpers: password hashing, JWT issuance/verification, and
in-memory session bookkeeping used by main.py."""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request
from jose import JWTError, jwt
from passlib.context import CryptContext

from models import UserSession

SECRET_KEY = os.getenv("SECRET_KEY", "your_secret_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# In-memory stores shared with main.py
users_db: dict = {}
active_sessions: dict[str, UserSession] = {}
blacklisted_tokens: set[str] = set()


# ---------- Password helpers ----------

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def authenticate_user(username: str, password: str):
    user = users_db.get(username)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user


# ---------- JWT helpers ----------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Returns the username (sub) encoded in a valid, non-blacklisted token, else None."""
    if token in blacklisted_tokens:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


def get_token(request: Request) -> Optional[str]:
    """Reads the bearer token from the Authorization header, falling back to the
    httponly access_token cookie set at login."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1]
    return request.cookies.get("access_token")


# ---------- Session helpers ----------

def create_session(username: str, token: str) -> None:
    """Creates (or replaces) the active session for a user, blacklisting any
    previously issued token so only the latest login stays valid."""
    existing = active_sessions.get(username)
    if existing and existing.token:
        blacklisted_tokens.add(existing.token)
    now = datetime.now(timezone.utc)
    active_sessions[username] = UserSession(
        username=username,
        login_time=now,
        last_activity=now,
        token=token,
        user_data={},
    )


def touch_session(username: str) -> None:
    session = active_sessions.get(username)
    if session:
        session.last_activity = datetime.now(timezone.utc)


def end_session(username: str, token: str) -> None:
    blacklisted_tokens.add(token)
    active_sessions.pop(username, None)
