"""Pydantic schemas for PocketSmart AI: requests, responses, and internal
session/recommendation records shared across main.py and gemini_utils.py."""
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------- Auth ----------

class RegisterUser(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    password: str


class UserInDB(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    hashed_password: str
    disabled: bool = False


class Token(BaseModel):
    access_token: str
    token_type: str


# ---------- Sessions ----------

class UserSession(BaseModel):
    username: str
    login_time: datetime
    last_activity: datetime
    token: str
    user_data: dict[str, Any] = Field(default_factory=dict)


# ---------- Recommendation history ----------

class RecommendationItem(BaseModel):
    id: str
    timestamp: str
    recommendation_type: str
    input_summary: dict[str, Any]
    result_summary: dict[str, Any]
    full_result: dict[str, Any]


# ---------- Planner inputs ----------

class HomeBudgetInput(BaseModel):
    total_budget: float
    num_lights: int
    num_fans: int
    num_furniture: int
    num_dining_tables: int
    has_living_room: bool = False
    has_kitchen: bool = False
    has_bedroom: bool = False
    additional_requirements: Optional[str] = None

    @field_validator("total_budget")
    @classmethod
    def budget_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("total_budget must be greater than 0")
        return v

    @field_validator("num_lights", "num_fans", "num_furniture", "num_dining_tables")
    @classmethod
    def counts_must_be_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("counts must be 0 or greater")
        return v


class PartyBudgetInput(BaseModel):
    total_budget: float
    num_guests: int
    party_type: str
    venue_type: Optional[str] = None
    needs_catering: bool = False
    needs_decoration: bool = False
    needs_entertainment: bool = False
    additional_requirements: Optional[str] = None

    @field_validator("total_budget")
    @classmethod
    def budget_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("total_budget must be greater than 0")
        return v

    @field_validator("num_guests")
    @classmethod
    def guests_must_be_at_least_one(cls, v: int) -> int:
        if v < 1:
            raise ValueError("num_guests must be at least 1")
        return v

    @field_validator("party_type")
    @classmethod
    def party_type_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("party_type must not be empty")
        return v


class JewelryBudgetInput(BaseModel):
    total_budget: float
    occasion: str
    preferences: Optional[str] = None

    @field_validator("total_budget")
    @classmethod
    def budget_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("total_budget must be greater than 0")
        return v

    @field_validator("occasion")
    @classmethod
    def occasion_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("occasion must not be empty")
        return v
