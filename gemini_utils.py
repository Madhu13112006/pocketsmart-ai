"""Gemini prompt orchestration, JSON extraction, shopping-link construction,
file upload handling, and recommendation history storage for PocketSmart AI."""
import json
import logging
import os
import re
import time
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Optional

import google.generativeai as genai
from fastapi import HTTPException, UploadFile
from google.api_core.exceptions import NotFound
from PIL import Image

from models import (
    HomeBudgetInput,
    JewelryBudgetInput,
    PartyBudgetInput,
    RecommendationItem,
)

logger = logging.getLogger("pocketsmart.gemini")

# Tried in order on every call. Cheaper/lighter models first; `gemini-3.8-flash`
# is deliberately excluded here (higher cost, 20 requests/day free-tier quota).
# A `NotFound` (model retired/unavailable for this key) skips to the next
# candidate immediately; other errors (e.g. quota exhaustion) retry once on
# the same model before moving on.
MODEL_CANDIDATES = [
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest",
]

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

# Shared with main.py
user_recommendations: dict[str, list[RecommendationItem]] = {}


# ---------- JSON extraction ----------

def extract_json_from_response(text: str) -> dict:
    """Strips markdown code fences and pulls the outermost {...} block out of a
    Gemini response, raising a clean error instead of a raw stack trace."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned.strip(), flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned.strip()).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in Gemini response")

    json_str = cleaned[start:end + 1]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Could not parse JSON from Gemini response: {exc}") from exc


# ---------- Currency ----------

def usd_to_inr(amount_usd: float, exchange_rate: float = 83.0) -> float:
    return round(amount_usd * exchange_rate, 2)


# ---------- File uploads ----------

def save_upload_file(upload_file: UploadFile) -> str:
    """Validates and saves an uploaded outfit image under static/uploads/,
    returning the relative path to the saved file."""
    original_name = upload_file.filename or "upload"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    contents = upload_file.file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds the 5 MB size limit")

    os.makedirs("static/uploads", exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", original_name)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}_{safe_name}"
    path = os.path.join("static", "uploads", filename)

    with open(path, "wb") as f:
        f.write(contents)

    return path


# ---------- History ----------

def save_to_history(username: str, recommendation_type: str, input_data: dict, result: dict) -> RecommendationItem:
    item = RecommendationItem(
        id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        recommendation_type=recommendation_type,
        input_summary=input_data,
        result_summary={
            "total_budget": result.get("total_budget"),
            "remaining_budget": result.get("remaining_budget"),
            "source": result.get("source", "gemini"),
        },
        full_result=result,
    )
    user_recommendations.setdefault(username, []).append(item)
    return item


# ---------- Gemini call with retry ----------

def _generate_with_retry(parts) -> str:
    """Tries each model in MODEL_CANDIDATES in order. A NotFound (model
    retired/unavailable for this key) moves to the next candidate immediately;
    any other error retries once on the same model before moving on. Raises
    the last exception seen if every candidate fails, which the caller is
    responsible for falling back on."""
    last_exc = None
    for model_name in MODEL_CANDIDATES:
        model = genai.GenerativeModel(model_name)
        for attempt in range(2):
            try:
                response = model.generate_content(parts)
                return response.text
            except NotFound as exc:
                last_exc = exc
                logger.warning("Model %s unavailable for this key, trying next candidate", model_name)
                break
            except Exception as exc:  # noqa: BLE001 - genuinely need to catch any SDK error
                last_exc = exc
                if attempt == 0:
                    time.sleep(1)
    raise last_exc


# ---------- Shopping link builders ----------

def _amazon(q): return f"https://www.amazon.in/s?k={urllib.parse.quote_plus(q)}"
def _flipkart(q): return f"https://www.flipkart.com/search?q={urllib.parse.quote_plus(q)}"
def _ikea(q): return f"https://www.ikea.com/in/en/search/?q={urllib.parse.quote_plus(q)}"
def _myntra(q): return f"https://www.myntra.com/search?q={urllib.parse.quote_plus(q)}"
def _ajio(q): return f"https://www.ajio.com/search/?text={urllib.parse.quote_plus(q)}"
def _bigbasket(q): return f"https://www.bigbasket.com/ps/?q={urllib.parse.quote_plus(q)}"
def _swiggy(q): return f"https://www.swiggy.com/search?query={urllib.parse.quote_plus(q)}"
def _zomato(q): return f"https://www.zomato.com/search?q={urllib.parse.quote_plus(q)}"
def _bookmyshow(q): return f"https://in.bookmyshow.com/search?q={urllib.parse.quote_plus(q)}"
def _meesho(q): return f"https://www.meesho.com/search?q={urllib.parse.quote_plus(q)}"
def _google(q): return f"https://www.google.com/search?q={urllib.parse.quote_plus(q)}"
def _booking(q): return f"https://www.booking.com/search.html?ss={urllib.parse.quote_plus(q)}"
def _makemytrip(q): return f"https://www.makemytrip.com/hotels/hotel-listing/?searchText={urllib.parse.quote_plus(q)}"
def _oyorooms(q): return f"https://www.oyorooms.com/search/?location={urllib.parse.quote_plus(q)}"
def _nobroker(q): return f"https://www.nobroker.in/property/search?searchTerm={urllib.parse.quote_plus(q)}"
def _bluestone(q): return f"https://www.bluestone.com/search.html?query={urllib.parse.quote_plus(q)}"
def _tanishq(q): return f"https://www.tanishq.co.in/search?q={urllib.parse.quote_plus(q)}"
def _caratlane(q): return f"https://www.caratlane.com/search?q={urllib.parse.quote_plus(q)}"
def _melorra(q): return f"https://www.melorra.com/search?q={urllib.parse.quote_plus(q)}"

PLATFORM_BUILDERS = {
    "amazon": _amazon, "flipkart": _flipkart, "ikea": _ikea, "myntra": _myntra,
    "ajio": _ajio, "bigbasket": _bigbasket, "swiggy": _swiggy, "zomato": _zomato,
    "bookmyshow": _bookmyshow, "meesho": _meesho, "google": _google,
    "booking": _booking, "makemytrip": _makemytrip, "oyorooms": _oyorooms,
    "nobroker": _nobroker, "bluestone": _bluestone, "tanishq": _tanishq,
    "caratlane": _caratlane, "melorra": _melorra,
}


def _links_for(platforms: list[str], query: str) -> dict:
    return {name: PLATFORM_BUILDERS[name](query) for name in platforms if name in PLATFORM_BUILDERS}


# ---------- Fallback recommendations ----------

def _home_fallback(budget_input: HomeBudgetInput) -> dict:
    budget = budget_input.total_budget
    categories = [
        ("lighting", 0.20, "lights/fixtures", budget_input.num_lights, "LED ceiling light"),
        ("fans", 0.15, "ceiling fans", budget_input.num_fans, "ceiling fan"),
        ("furniture", 0.45, "furniture pieces", budget_input.num_furniture, "sofa set"),
        ("dining", 0.20, "dining tables", budget_input.num_dining_tables, "4-seater dining table"),
    ]
    breakdown = []
    total_allocated = 0.0
    for category, share, _label, qty, search_term in categories:
        allocation = round(budget * share, 2)
        total_allocated += allocation
        qty = max(qty, 1)
        unit_price = round(allocation / qty, 2) if qty else allocation
        breakdown.append({
            "category": category,
            "allocation": allocation,
            "items": [{
                "name": search_term.title(),
                "description": f"Budget-friendly {search_term} suitable for Indian homes",
                "estimated_price": unit_price,
                "quantity": qty,
                "search_terms": search_term,
            }],
        })
    return {
        "total_budget": budget,
        "budget_breakdown": breakdown,
        "calculation_table": [
            {
                "category": b["category"],
                "items_count": sum(i["quantity"] for i in b["items"]),
                "total_cost": b["allocation"],
                "percentage_of_budget": round((b["allocation"] / budget) * 100, 2) if budget else 0,
            }
            for b in breakdown
        ],
        "remaining_budget": round(budget - total_allocated, 2),
        "additional_suggestions": [
            "Prices shown are estimates; always compare live prices before buying.",
            "Consider seasonal sales on Amazon/Flipkart for additional savings.",
        ],
        "source": "fallback",
    }


def _party_fallback(budget_input: PartyBudgetInput) -> dict:
    budget = budget_input.total_budget
    shares = {"venue": 0.30, "catering": 0.30, "decoration": 0.15, "entertainment": 0.15, "contingency": 0.10}
    breakdown = []
    total_allocated = 0.0
    for category, share in shares.items():
        allocation = round(budget * share, 2)
        total_allocated += allocation
        entry = {"category": category, "allocation": allocation, "items": []}
        if category != "contingency":
            entry["items"].append({
                "name": f"{category.title()} package",
                "description": f"Standard {category} package for a {budget_input.party_type} with {budget_input.num_guests} guests",
                "estimated_price": allocation,
                "quantity": 1,
                "search_terms": f"{category} for {budget_input.party_type} party",
            })
        breakdown.append(entry)
    return {
        "total_budget": budget,
        "budget_breakdown": breakdown,
        "venue_suggestions": [{
            "name": "Local community hall / banquet",
            "type": budget_input.venue_type or "Indoor venue",
            "capacity": budget_input.num_guests,
            "estimated_cost": shares["venue"] * budget,
            "search_terms": f"{budget_input.venue_type or 'banquet hall'} for {budget_input.num_guests} guests",
        }],
        "remaining_budget": round(budget - total_allocated, 2),
        "additional_suggestions": [
            "Book vendors at least 2 weeks in advance for better rates.",
            "Compare catering packages on Swiggy/Zomato for bulk orders.",
        ],
        "source": "fallback",
    }


def _jewelry_fallback(budget_input: JewelryBudgetInput, has_image: bool) -> dict:
    budget = budget_input.total_budget
    items = [
        {"item_type": "Earrings", "description": "Lightweight everyday earrings", "style": "minimal", "estimated_price": round(budget * 0.3, 2), "search_terms": f"earrings for {budget_input.occasion}"},
        {"item_type": "Necklace", "description": "Simple pendant necklace", "style": "classic", "estimated_price": round(budget * 0.5, 2), "search_terms": f"necklace for {budget_input.occasion}"},
        {"item_type": "Bracelet", "description": "Delicate chain bracelet", "style": "minimal", "estimated_price": round(budget * 0.2, 2), "search_terms": f"bracelet for {budget_input.occasion}"},
    ]
    total_allocated = sum(i["estimated_price"] for i in items)
    result = {
        "total_budget": budget,
        "jewelry_recommendations": items,
        "remaining_budget": round(budget - total_allocated, 2),
        "styling_tips": [
            "Pair gold-toned pieces with warm color outfits.",
            "Keep accessories minimal for formal occasions.",
        ],
        "source": "fallback",
    }
    if has_image:
        result["outfit_analysis"] = {"colors": [], "style": "unknown", "formality": "unknown"}
    return result


# ---------- Home planner ----------

def get_home_recommendations(budget_input: HomeBudgetInput) -> dict:
    rooms = []
    if budget_input.has_living_room:
        rooms.append("Living Room")
    if budget_input.has_kitchen:
        rooms.append("Kitchen")
    if budget_input.has_bedroom:
        rooms.append("Bedroom")

    prompt = f"""I need interior design product recommendations for a home in India with a total budget of ₹{budget_input.total_budget:.2f}.

Requirements:
- Number of lights/fixtures needed: {budget_input.num_lights}
- Number of ceiling fans needed: {budget_input.num_fans}
- Number of furniture pieces needed: {budget_input.num_furniture}
- Number of dining tables needed: {budget_input.num_dining_tables}
- Rooms to furnish: {', '.join(rooms) if rooms else 'Not specified'}
- Additional requirements: {budget_input.additional_requirements or 'None'}

Recommend Indian brands and products with pricing in INR (₹), and provide concise search terms
suitable for searching on Indian shopping platforms (Amazon India, Flipkart, IKEA India, Myntra, Ajio).

Respond with ONLY a JSON object in exactly this shape, no extra commentary:
{{"total_budget": 0.0,
 "budget_breakdown": [{{"category": "lighting", "allocation": 0.0,
   "items": [{{"name": "", "description": "", "estimated_price": 0.0, "quantity": 0, "search_terms": ""}}]}}],
 "calculation_table": [{{"category": "", "items_count": 0, "total_cost": 0.0, "percentage_of_budget": 0.0}}],
 "remaining_budget": 0.0,
 "additional_suggestions": []}}"""

    try:
        raw_text = _generate_with_retry(prompt)
        result = extract_json_from_response(raw_text)
    except Exception as exc:
        logger.warning("Home planner falling back to static data: %s", exc)
        return _home_fallback(budget_input)

    try:
        for category in result.get("budget_breakdown", []):
            for item in category.get("items", []):
                search_terms = item.get("search_terms")
                if search_terms:
                    item["shopping_links"] = _links_for(
                        ["amazon", "flipkart", "ikea", "myntra", "ajio"], search_terms
                    )
        result.setdefault("source", "gemini")
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {exc}")


# ---------- Party planner ----------

CATEGORY_PLATFORMS = {
    "venue": ["google", "booking", "makemytrip", "oyorooms", "nobroker"],
    "catering": ["swiggy", "zomato"],
    "food": ["swiggy", "zomato", "bigbasket", "amazon", "flipkart"],
    "drinks": ["swiggy", "zomato", "bigbasket", "amazon", "flipkart"],
    "decoration": ["amazon", "flipkart", "meesho", "myntra"],
    "entertainment": ["bookmyshow", "amazon", "flipkart"],
    "gifts": ["amazon", "flipkart", "myntra", "meesho"],
    "photography": ["google", "amazon", "flipkart"],
    "music": ["amazon", "flipkart", "bookmyshow"],
    "games": ["amazon", "flipkart"],
    "accessories": ["amazon", "flipkart", "myntra", "meesho"],
    "transportation": ["makemytrip", "google"],
    "return_gifts": ["amazon", "flipkart", "myntra", "meesho"],
}
DEFAULT_PLATFORMS = ["amazon", "flipkart", "google"]
VENUE_PLATFORMS = ["google", "booking", "makemytrip", "oyorooms", "nobroker"]


def get_party_recommendations(budget_input: PartyBudgetInput) -> dict:
    prompt = f"""I'm planning a {budget_input.party_type} party in India with a total budget of ₹{budget_input.total_budget:.2f}.

Details:
- Number of guests: {budget_input.num_guests}
- Venue type: {budget_input.venue_type or 'Not specified'}
- Needs catering: {'Yes' if budget_input.needs_catering else 'No'}
- Needs decoration: {'Yes' if budget_input.needs_decoration else 'No'}
- Needs entertainment: {'Yes' if budget_input.needs_entertainment else 'No'}
- Additional requirements: {budget_input.additional_requirements or 'None'}

Recommend Indian brands/services and pricing in INR (₹). Respond with ONLY a JSON object in exactly
this shape, no extra commentary:
{{"total_budget": 0.0,
 "budget_breakdown": [{{"category": "venue", "allocation": 0.0,
   "items": [{{"name": "", "description": "", "estimated_price": 0.0, "quantity": 0, "search_terms": ""}}]}}],
 "venue_suggestions": [{{"name": "", "type": "", "capacity": 0, "estimated_cost": 0.0, "search_terms": ""}}],
 "remaining_budget": 0.0,
 "additional_suggestions": []}}"""

    try:
        raw_text = _generate_with_retry(prompt)
        result = extract_json_from_response(raw_text)
    except Exception as exc:
        logger.warning("Party planner falling back to static data: %s", exc)
        return _party_fallback(budget_input)

    try:
        total_budget = result.get("total_budget", budget_input.total_budget) or 1
        calculation_table = []
        for category in result.get("budget_breakdown", []):
            items = category.get("items", [])
            total_cost = sum(i.get("estimated_price", 0) * i.get("quantity", 1) for i in items) or category.get("allocation", 0)
            calculation_table.append({
                "category": category.get("category", ""),
                "items_count": len(items),
                "total_cost": total_cost,
                "percentage_of_budget": round((total_cost / total_budget) * 100, 2) if total_budget else 0,
            })
            platforms = CATEGORY_PLATFORMS.get(category.get("category", "").lower(), DEFAULT_PLATFORMS)
            for item in items:
                search_terms = item.get("search_terms")
                if search_terms:
                    item["shopping_links"] = _links_for(platforms, search_terms)
        result["calculation_table_inr"] = calculation_table

        for venue in result.get("venue_suggestions", []):
            search_terms = venue.get("search_terms")
            if search_terms:
                venue["search_links"] = _links_for(VENUE_PLATFORMS, search_terms)

        result.setdefault("source", "gemini")
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {exc}")


# ---------- Jewelry planner ----------

def get_jewelry_recommendations(budget_input: JewelryBudgetInput, image_path: Optional[str] = None) -> dict:
    base_prompt = f"""I need jewelry recommendations for a budget of ₹{budget_input.total_budget:.2f} in India.

Occasion: {budget_input.occasion}
Style preferences: {budget_input.preferences or 'None specified'}

Provide only India-relevant styles, availability, and price ranges in INR (₹), referencing Indian
jewelry brands/platforms (Amazon India, Flipkart, BlueStone, Tanishq, CaratLane, Melorra, Meesho)."""

    try:
        if image_path:
            img = Image.open(image_path)
            prompt = base_prompt + """

An image of the outfit is uploaded. Suggest jewelry that complements it, considering color, design,
and occasion appropriateness.

Respond with ONLY a JSON object in exactly this shape, no extra commentary:
{"total_budget": 0.0,
 "outfit_analysis": {"colors": [], "style": "", "formality": ""},
 "jewelry_recommendations": [{"item_type": "", "description": "", "style": "", "estimated_price": 0.0, "search_terms": ""}],
 "remaining_budget": 0.0,
 "styling_tips": []}"""
            raw_text = _generate_with_retry([prompt, img])
        else:
            prompt = base_prompt + """

Respond with ONLY a JSON object in exactly this shape, no extra commentary:
{"total_budget": 0.0,
 "jewelry_recommendations": [{"item_type": "", "description": "", "style": "", "estimated_price": 0.0, "search_terms": ""}],
 "remaining_budget": 0.0,
 "styling_tips": []}"""
            raw_text = _generate_with_retry(prompt)

        result = extract_json_from_response(raw_text)
    except Exception as exc:
        logger.warning("Jewelry planner falling back to static data: %s", exc)
        return _jewelry_fallback(budget_input, has_image=bool(image_path))

    try:
        for item in result.get("jewelry_recommendations", []):
            search_terms = item.get("search_terms")
            if search_terms:
                item["shopping_links"] = _links_for(
                    ["amazon", "flipkart", "bluestone", "tanishq", "caratlane", "melorra", "meesho"],
                    search_terms,
                )
        result.setdefault("source", "gemini")
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {exc}")
