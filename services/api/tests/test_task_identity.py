"""Per-owner task numbers + public_id SOT for sharing/API identity."""

from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import select, text

from docket.db import database
from docket.main import create_app
from docket.models import Membership, Role, Task, User
from docket.security import password_hasher


def _bootstrap(client: TestClient, email: str = "ops@example.com") -> None:
    res = client.post(
        "/api/auth/bootstrap",
        json={
            "email": email,
            "display_name": "Ops",
            "password": "password123",
        },
    )
    assert res.status_code == 200


def _create_owner_user(email: str, display_name: str, password: str) -> User:
    session = database.session()
    try:
        user = User(
            email=email,
            display_name=display_name,
            password_hash=password_hasher.hash(password),
        )
        session.add(user)
        session.flush()
        role = session.scalar(select(Role).where(Role.name == "owner"))
        assert role is not None
        session.add(
            Membership(
                user_id=user.id,
                role_id=role.id,
                scope_type="global",
                scope_task_id=None,
            )
        )
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user
    finally:
        session.close()


def _login(client: TestClient, email: str, password: str) -> None:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200


def test_two_owners_share_same_local_number_with_distinct_public_ids() -> None:
    client = TestClient(create_app())
    _bootstrap(client)

    a1 = client.post("/api/tasks", json={"title": "A1"}).json()
    a2 = client.post("/api/tasks", json={"title": "A2"}).json()
    assert a1["number"] == 1
    assert a2["number"] == 2
    assert a1["id"] != a2["id"]
    UUID(a1["id"])
    UUID(a2["id"])

    _create_owner_user("alex@example.com", "Alex", "password123")
    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")

    b1 = client.post("/api/tasks", json={"title": "B1"})
    assert b1.status_code == 201, b1.text
    body = b1.json()
    assert body["number"] == 1
    assert body["id"] != a1["id"]
    UUID(body["id"])

    detail = client.get(f"/api/tasks/{body['id']}")
    assert detail.status_code == 200
    assert detail.json()["task"]["number"] == 1


def test_sharing_uses_public_id_not_local_number() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task = client.post("/api/tasks", json={"title": "Shared"}).json()
    public_id = task["id"]
    assert task["number"] == 1

    _create_owner_user("alex@example.com", "Alex", "password123")
    share = client.post(
        f"/api/tasks/{public_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert share.status_code == 201

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    detail = client.get(f"/api/tasks/{public_id}")
    assert detail.status_code == 200
    assert detail.json()["task"]["id"] == public_id
    assert detail.json()["task"]["number"] == 1

    own = client.post("/api/tasks", json={"title": "Alex own"})
    assert own.status_code == 201, own.text
    own_body = own.json()
    assert own_body["number"] == 1
    assert own_body["id"] != public_id
    assert client.get(f"/api/tasks/{own_body['id']}").status_code == 200


def test_unknown_public_id_is_404_not_enumerable() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    missing = "00000000-0000-4000-8000-000000000099"
    assert client.get(f"/api/tasks/{missing}").status_code == 404


def test_migration_backfills_public_id_and_owner_numbers(tmp_path, monkeypatch) -> None:
    """Apply alembic upgrade over legacy rows and assert identity backfill."""
    from alembic import command
    from alembic.config import Config

    db_path = tmp_path / "migrate.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("ARTIFACT_STORAGE", "local")
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(tmp_path / "artifacts"))

    from docket.config import get_settings
    from docket.db import database
    import docket.models  # noqa: F401

    get_settings.cache_clear()
    database.rebind()

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "c3d4e5f6a7b8")

    with database.engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, display_name, password_hash) "
                "VALUES (1, 'a@example.com', 'A', 'x'), "
                "(2, 'b@example.com', 'B', 'y')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO tasks ("
                "id, owner_user_id, title, body, status, priority, rank, source, "
                "created_by_user_id, created_at, updated_at"
                ") VALUES "
                "(10, 1, 'A-old', NULL, 'backlog', 3, 0.0, 'ui', 1, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),"
                "(11, 1, 'A-new', NULL, 'backlog', 3, 0.0, 'ui', 1, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),"
                "(12, 2, 'B-only', NULL, 'backlog', 3, 0.0, 'ui', 2, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )

    command.upgrade(cfg, "head")
    get_settings.cache_clear()
    database.rebind()

    session = database.session()
    try:
        rows = session.scalars(select(Task).order_by(Task.id)).all()
        assert len(rows) == 3
        by_owner: dict[int, list[Task]] = {}
        for row in rows:
            assert row.public_id
            UUID(row.public_id)
            by_owner.setdefault(row.owner_user_id, []).append(row)
        assert [t.owner_task_number for t in by_owner[1]] == [1, 2]
        assert [t.owner_task_number for t in by_owner[2]] == [1]
        assert len({t.public_id for t in rows}) == 3
    finally:
        session.close()
        get_settings.cache_clear()
