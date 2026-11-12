"""Shared test helpers (not production code)."""

import secrets

from fastapi.testclient import TestClient
from sqlalchemy import select

from docket.db import database
from docket.models import ApiToken, Role
from docket.security import api_token_hasher


def bootstrap_owner(client: TestClient) -> dict:
    response = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password123",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def mint_api_token(*, user_id: int, name: str = "test-agent") -> tuple[str, int]:
    """Insert an API token row; return (raw_token, token_id)."""
    raw = f"dckt_test_{secrets.token_urlsafe(24)}"
    # Use database.SessionLocal so tests that rebind the engine stay correct.
    db = database.SessionLocal()
    try:
        role = db.scalar(select(Role).where(Role.name == "agent_worker"))
        assert role is not None
        token = ApiToken(
            user_id=user_id,
            name=name,
            token_hash=api_token_hasher.hash(raw),
            role_id=role.id,
        )
        db.add(token)
        db.commit()
        db.refresh(token)
        return raw, token.id
    finally:
        db.close()


def bearer(raw_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {raw_token}"}
