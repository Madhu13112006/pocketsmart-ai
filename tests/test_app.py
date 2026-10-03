"""End-to-end API tests for PocketSmart AI using FastAPI's TestClient.

Gemini calls are mocked so the suite passes with no GOOGLE_API_KEY configured.
"""
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient

import auth
import gemini_utils
import main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def reset_state():
    """Clears in-memory stores and the shared client's cookie jar between tests
    so a login in one test can't leak a valid session into the next."""
    auth.users_db.clear()
    auth.active_sessions.clear()
    auth.blacklisted_tokens.clear()
    gemini_utils.user_recommendations.clear()
    client.cookies.clear()
    yield


def register_and_login(username="alice", password="password123"):
    client.post(
        "/register",
        json={"username": username, "email": f"{username}@example.com", "password": password},
    )
    response = client.post("/token", data={"username": username, "password": password})
    return response


# ---------- Auth ----------

def test_register_new_user():
    response = client.post(
        "/register",
        json={"username": "bob", "email": "bob@example.com", "password": "secret123"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "bob"


def test_register_duplicate_username_rejected():
    client.post(
        "/register",
        json={"username": "bob", "email": "bob@example.com", "password": "secret123"},
    )
    response = client.post(
        "/register",
        json={"username": "bob", "email": "other@example.com", "password": "secret123"},
    )
    assert response.status_code == 400


def test_login_wrong_password_rejected():
    client.post(
        "/register",
        json={"username": "bob", "email": "bob@example.com", "password": "secret123"},
    )
    response = client.post("/token", data={"username": "bob", "password": "wrongpass"})
    assert response.status_code == 401


def test_login_success_sets_cookie():
    response = register_and_login()
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert "access_token" in response.cookies


# ---------- Protected routes ----------

def test_protected_route_without_token_rejected():
    response = client.get("/session-info")
    assert response.status_code == 401


def test_dashboard_redirects_without_auth():
    response = client.get("/dashboard", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login"


# ---------- History ----------

def test_history_empty_for_new_user():
    register_and_login()
    response = client.get("/recommendation-history")
    assert response.status_code == 200
    assert response.json() == {"history": []}


def test_history_populated_after_home_planner_call():
    register_and_login()

    fake_result = {
        "total_budget": 5000.0,
        "budget_breakdown": [],
        "calculation_table": [],
        "remaining_budget": 5000.0,
        "additional_suggestions": [],
    }
    with patch("main.get_home_recommendations", return_value=fake_result):
        response = client.post(
            "/home-budget",
            json={
                "total_budget": 5000,
                "num_lights": 5,
                "num_fans": 4,
                "num_furniture": 2,
                "num_dining_tables": 1,
                "has_living_room": True,
                "has_kitchen": True,
                "has_bedroom": False,
            },
        )
    assert response.status_code == 200

    history_response = client.get("/recommendation-history")
    history = history_response.json()["history"]
    assert len(history) == 1
    assert history[0]["type"] == "home"
    assert history[0]["summary"]["total_budget"] == 5000.0


def test_logout_blacklists_token():
    login_response = register_and_login()
    token = login_response.json()["access_token"]

    logout_response = client.post("/logout", follow_redirects=False)
    assert logout_response.status_code == 302

    response = client.get(
        "/session-info", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


# ---------- Validation ----------

def test_home_budget_rejects_non_positive_budget():
    register_and_login()
    response = client.post(
        "/home-budget",
        json={
            "total_budget": -5,
            "num_lights": 1,
            "num_fans": 1,
            "num_furniture": 1,
            "num_dining_tables": 1,
        },
    )
    assert response.status_code == 422


def test_party_budget_rejects_zero_guests():
    register_and_login()
    response = client.post(
        "/party-budget",
        json={
            "total_budget": 1000,
            "num_guests": 0,
            "party_type": "Birthday",
        },
    )
    assert response.status_code == 422
