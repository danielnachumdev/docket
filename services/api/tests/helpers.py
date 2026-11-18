"""Shared test helpers (not production code)."""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from waymark.db import database
from waymark.models import ApiToken, RegistrationInvite, Role, Task, User
from waymark.security import api_token_hasher


def task_by_public_id(public_id: str) -> Task:
    """Load a task ORM row by API SOT id (public_id)."""
    db = database.SessionLocal()
    try:
        task = db.scalar(select(Task).where(Task.public_id == public_id))
        assert task is not None
        db.expunge(task)
        return task
    finally:
        db.close()


def internal_task_id(public_id: str) -> int:
    return task_by_public_id(public_id).id



def bootstrap_owner(client: TestClient) -> dict:
    response = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password1234",
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


def invite_and_register_contact(
    client: TestClient,
    *,
    email: str,
    display_name: str,
    password: str = "password1234",
    owner_email: str = "ops@example.com",
    owner_password: str = "password1234",
) -> dict:
    """Invite + register a user into the owner's contact graph; leave owner logged in."""
    invite = client.post("/api/invites", json={"email": email})
    assert invite.status_code == 201, invite.text
    token = invite.json()["token"]
    client.post("/api/auth/logout")
    registered = client.post(
        "/api/auth/register",
        json={
            "token": token,
            "email": email,
            "display_name": display_name,
            "password": password,
        },
    )
    assert registered.status_code == 200, registered.text
    client.post("/api/auth/logout")
    login = client.post(
        "/api/auth/login",
        json={"email": owner_email, "password": owner_password},
    )
    assert login.status_code == 200, login.text
    return registered.json()


def link_as_contact(*, owner_user_id: int, contact: User) -> None:
    """Seed the invitee edge so ``contact`` appears in the owner's collaborators."""
    db = database.SessionLocal()
    try:
        db.add(
            RegistrationInvite(
                created_by_user_id=owner_user_id,
                token_hash=secrets.token_hex(32),
                email=contact.email,
                expires_at=datetime.now(UTC) + timedelta(days=7),
                consumed_at=datetime.now(UTC),
                consumed_by_user_id=contact.id,
            )
        )
        db.commit()
    finally:
        db.close()
