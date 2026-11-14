import base64
from pathlib import Path

from fastapi.testclient import TestClient

from docket.config import get_settings
from docket.db import database
from docket.main import create_app
from docket.models import Artifact


def _bootstrap(client: TestClient) -> None:
    res = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password1234",
        },
    )
    assert res.status_code == 200


def _create_task(client: TestClient) -> int:
    res = client.post("/api/tasks", json={"title": "Demo task", "priority": 2})
    assert res.status_code == 201
    return res.json()["id"]


def test_artifact_crud_text_and_file(tmp_path: Path, monkeypatch) -> None:
    artifact_root = tmp_path / "arts"
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    get_settings.cache_clear()

    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "hello ops"},
    )
    assert created.status_code == 201
    text_id = created.json()["id"]
    assert created.json()["storage_key"] is None
    assert created.json()["byte_size"] == 0

    listed = client.get(f"/api/tasks/{task_id}/artifacts")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["byte_size"] == 0

    got = client.get(f"/api/tasks/{task_id}/artifacts/{text_id}")
    assert got.status_code == 200
    assert got.json()["title"] == "Note"

    text_content = client.get(f"/api/tasks/{task_id}/artifacts/{text_id}/content")
    assert text_content.status_code == 200
    assert text_content.content == b"hello ops"

    patched = client.patch(
        f"/api/tasks/{task_id}/artifacts/{text_id}",
        json={"title": "Updated note", "content_text": "revised"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Updated note"
    assert patched.json()["byte_size"] == 0

    payload = base64.b64encode(b"file-bytes").decode("ascii")
    file_created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "demo.txt",
            "content_base64": payload,
            "content_type": "text/plain",
        },
    )
    assert file_created.status_code == 201
    file_body = file_created.json()
    assert file_body["storage_key"]
    assert file_body["content_type"] == "text/plain"
    assert file_body["byte_size"] == len(b"file-bytes")
    file_id = file_body["id"]

    library = client.get("/api/artifacts")
    assert library.status_code == 200
    by_id = {row["id"]: row for row in library.json()["items"]}
    assert by_id[text_id]["byte_size"] == 0
    assert by_id[file_id]["byte_size"] == len(b"file-bytes")

    stored = artifact_root / file_body["storage_key"]
    assert stored.is_file()
    assert stored.read_bytes() == b"file-bytes"

    downloaded = client.get(f"/api/tasks/{task_id}/artifacts/{file_id}/content")
    assert downloaded.status_code == 200
    assert downloaded.content == b"file-bytes"
    assert downloaded.headers["content-type"].startswith("text/plain")

    replaced = base64.b64encode(b"new-bytes").decode("ascii")
    file_patched = client.patch(
        f"/api/tasks/{task_id}/artifacts/{file_id}",
        json={"content_base64": replaced, "content_type": "text/plain"},
    )
    assert file_patched.status_code == 200
    assert file_patched.json()["byte_size"] == len(b"new-bytes")
    assert client.get(f"/api/tasks/{task_id}/artifacts/{file_id}/content").content == b"new-bytes"

    deleted = client.delete(f"/api/tasks/{task_id}/artifacts/{file_id}")
    assert deleted.status_code == 204
    assert not stored.exists()
    assert client.get(f"/api/tasks/{task_id}/artifacts/{file_id}").status_code == 404

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    events = {e["type"] for e in detail.json()["events"]}
    assert "artifact_added" in events
    assert "artifact_updated" in events
    assert "artifact_deleted" in events
    assert len(detail.json()["artifacts"]) == 1


def test_artifact_file_requires_base64() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    missing = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "file", "title": "empty.bin"},
    )
    assert missing.status_code == 400

    bad = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "bad.bin",
            "content_base64": "!!!not-base64!!!",
        },
    )
    assert bad.status_code == 400


def test_artifact_file_rejects_over_max_bytes(monkeypatch) -> None:
    monkeypatch.setenv("ARTIFACT_MAX_BYTES", "8")
    get_settings.cache_clear()

    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    over = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "too-big.bin",
            "content_base64": base64.b64encode(b"012345678").decode("ascii"),
            "content_type": "application/octet-stream",
        },
    )
    assert over.status_code == 413
    assert "8 bytes" in over.json()["detail"]

    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "tiny.bin",
            "content_base64": base64.b64encode(b"ok").decode("ascii"),
            "content_type": "application/octet-stream",
        },
    )
    assert created.status_code == 201
    artifact_id = created.json()["id"]

    replace_over = client.patch(
        f"/api/tasks/{task_id}/artifacts/{artifact_id}",
        json={
            "content_base64": base64.b64encode(b"012345678").decode("ascii"),
        },
    )
    assert replace_over.status_code == 413


def test_artifact_file_allows_under_max_bytes(monkeypatch) -> None:
    monkeypatch.setenv("ARTIFACT_MAX_BYTES", "16")
    get_settings.cache_clear()

    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    payload = b"0123456789abcdef"
    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "exact.bin",
            "content_base64": base64.b64encode(payload).decode("ascii"),
            "content_type": "application/octet-stream",
        },
    )
    assert created.status_code == 201
    artifact_id = created.json()["id"]
    assert (
        client.get(f"/api/tasks/{task_id}/artifacts/{artifact_id}/content").content
        == payload
    )


def test_image_artifact_content_disposition_inline(tmp_path: Path, monkeypatch) -> None:
    artifact_root = tmp_path / "arts"
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    get_settings.cache_clear()

    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    # Minimal 1x1 PNG
    png_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "demo-preview.png",
            "content_base64": base64.b64encode(png_bytes).decode("ascii"),
            "content_type": "image/png",
        },
    )
    assert created.status_code == 201
    artifact_id = created.json()["id"]

    res = client.get(f"/api/tasks/{task_id}/artifacts/{artifact_id}/content")
    assert res.status_code == 200
    assert res.content == png_bytes
    assert res.headers["content-type"].startswith("image/png")
    disposition = res.headers["content-disposition"]
    assert disposition.startswith("inline;")
    assert "demo-preview.png" in disposition

    plain = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "notes.txt",
            "content_base64": base64.b64encode(b"hello").decode("ascii"),
            "content_type": "text/plain",
        },
    )
    assert plain.status_code == 201
    plain_id = plain.json()["id"]
    plain_res = client.get(f"/api/tasks/{task_id}/artifacts/{plain_id}/content")
    assert plain_res.status_code == 200
    assert plain_res.headers["content-disposition"].startswith("attachment;")


def test_image_artifact_inline_by_filename_extension(
    tmp_path: Path, monkeypatch
) -> None:
    artifact_root = tmp_path / "arts"
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    get_settings.cache_clear()

    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "shot.JPEG",
            "content_base64": base64.b64encode(b"not-a-real-jpeg").decode("ascii"),
            "content_type": "application/octet-stream",
        },
    )
    assert created.status_code == 201
    artifact_id = created.json()["id"]

    res = client.get(f"/api/tasks/{task_id}/artifacts/{artifact_id}/content")
    assert res.status_code == 200
    assert res.headers["content-disposition"].startswith("inline;")
    assert res.headers["content-type"].startswith("image/jpeg")


def test_artifact_link_and_missing() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    link = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "link",
            "title": "Docs",
            "content_text": "https://example.com/docs",
        },
    )
    assert link.status_code == 201

    bare_link = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "link", "title": "Broken"},
    )
    assert bare_link.status_code == 400

    assert client.get(f"/api/tasks/{task_id}/artifacts/99999").status_code == 404
    assert client.delete(f"/api/tasks/{task_id}/artifacts/99999").status_code == 404


def _create_member_user(email: str, display_name: str, password: str):
    from sqlalchemy import select

    from docket.db import database
    from docket.models import Membership, Role, User
    from docket.security import password_hasher

    session = database.session()
    try:
        role = session.scalar(select(Role).where(Role.name == "member"))
        assert role is not None
        user = User(
            email=email,
            display_name=display_name,
            password_hash=password_hasher.hash(password),
        )
        session.add(user)
        session.flush()
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


def _create_user(email: str, display_name: str, password: str):
    from docket.db import database
    from docket.models import User
    from docket.security import password_hasher

    session = database.session()
    try:
        user = User(
            email=email,
            display_name=display_name,
            password_hash=password_hasher.hash(password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user
    finally:
        session.close()


def _login(client: TestClient, email: str, password: str) -> None:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200


def test_list_accessible_artifacts_includes_owned_and_shared() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    owned_task = _create_task(client)
    owned = client.post(
        f"/api/tasks/{owned_task}/artifacts",
        json={"kind": "text", "title": "Owner note", "content_text": "mine"},
    )
    assert owned.status_code == 201

    _create_member_user("alex@example.com", "Alex", "password1234")
    other = TestClient(create_app())
    _login(other, "alex@example.com", "password1234")
    other_task = other.post("/api/tasks", json={"title": "Alex task", "priority": 2})
    assert other_task.status_code == 201
    other_task_id = other_task.json()["id"]
    other_art = other.post(
        f"/api/tasks/{other_task_id}/artifacts",
        json={"kind": "text", "title": "Private note", "content_text": "secret"},
    )
    assert other_art.status_code == 201

    shared_task = client.post("/api/tasks", json={"title": "Shared board", "priority": 2})
    assert shared_task.status_code == 201
    shared_id = shared_task.json()["id"]
    shared_art = client.post(
        f"/api/tasks/{shared_id}/artifacts",
        json={"kind": "text", "title": "Shared note", "content_text": "visible"},
    )
    assert shared_art.status_code == 201
    share = client.post(
        f"/api/tasks/{shared_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert share.status_code == 201

    owner_list = client.get("/api/artifacts")
    assert owner_list.status_code == 200
    owner_body = owner_list.json()
    assert owner_body["total"] == 2
    assert owner_body["has_more"] is False
    owner_titles = {row["title"] for row in owner_body["items"]}
    assert "Owner note" in owner_titles
    assert "Shared note" in owner_titles
    assert "Private note" not in owner_titles
    owner_row = next(r for r in owner_body["items"] if r["title"] == "Owner note")
    assert owner_row["can_modify"] is True
    assert owner_row["task_title"] == "Demo task"

    viewer_list = other.get("/api/artifacts")
    assert viewer_list.status_code == 200
    viewer_body = viewer_list.json()
    viewer_titles = {row["title"] for row in viewer_body["items"]}
    assert "Private note" in viewer_titles
    assert "Shared note" in viewer_titles
    assert "Owner note" not in viewer_titles
    shared_row = next(r for r in viewer_body["items"] if r["title"] == "Shared note")
    assert shared_row["can_modify"] is False
    assert shared_row["task_title"] == "Shared board"


def test_shared_viewer_can_read_but_not_mutate_artifacts() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)
    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Ops note", "content_text": "hello"},
    )
    assert created.status_code == 201
    artifact_id = created.json()["id"]
    assert created.json()["can_modify"] is True

    _create_user("alex@example.com", "Alex", "password1234")
    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert share.status_code == 201

    viewer = TestClient(create_app())
    _login(viewer, "alex@example.com", "password1234")
    listed = viewer.get(f"/api/tasks/{task_id}/artifacts")
    assert listed.status_code == 200
    assert listed.json()[0]["can_modify"] is False
    content = viewer.get(f"/api/tasks/{task_id}/artifacts/{artifact_id}/content")
    assert content.status_code == 200
    assert content.content == b"hello"

    patched = viewer.patch(
        f"/api/tasks/{task_id}/artifacts/{artifact_id}",
        json={"title": "Hijacked"},
    )
    assert patched.status_code == 403
    deleted = viewer.delete(f"/api/tasks/{task_id}/artifacts/{artifact_id}")
    assert deleted.status_code == 403


def test_shared_editor_cannot_mutate_others_artifact() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)
    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Ops note", "content_text": "hello"},
    )
    assert created.status_code == 201
    artifact_id = created.json()["id"]

    _create_user("alex@example.com", "Alex", "password1234")
    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )
    assert share.status_code == 201

    editor = TestClient(create_app())
    _login(editor, "alex@example.com", "password1234")
    listed = editor.get(f"/api/tasks/{task_id}/artifacts")
    assert listed.status_code == 200
    assert listed.json()[0]["can_modify"] is False

    patched = editor.patch(
        f"/api/tasks/{task_id}/artifacts/{artifact_id}",
        json={"title": "Hijacked"},
    )
    assert patched.status_code == 403
    assert "uploader" in patched.json()["detail"].lower()

    deleted = editor.delete(f"/api/tasks/{task_id}/artifacts/{artifact_id}")
    assert deleted.status_code == 403

    own = editor.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Editor note", "content_text": "mine"},
    )
    assert own.status_code == 201
    own_id = own.json()["id"]
    assert own.json()["can_modify"] is True
    assert (
        editor.patch(
            f"/api/tasks/{task_id}/artifacts/{own_id}",
            json={"title": "Editor note edited"},
        ).status_code
        == 200
    )
    assert editor.delete(f"/api/tasks/{task_id}/artifacts/{own_id}").status_code == 204


def test_list_accessible_artifacts_paginates_with_has_more() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)
    for i in range(5):
        created = client.post(
            f"/api/tasks/{task_id}/artifacts",
            json={"kind": "text", "title": f"Note {i}", "content_text": f"body-{i}"},
        )
        assert created.status_code == 201

    page1 = client.get("/api/artifacts", params={"limit": 2, "offset": 0})
    assert page1.status_code == 200
    body1 = page1.json()
    assert body1["limit"] == 2
    assert body1["offset"] == 0
    assert body1["total"] == 5
    assert body1["has_more"] is True
    assert len(body1["items"]) == 2
    assert body1["kind_counts"]["all"] == 5
    assert body1["kind_counts"]["text"] == 5

    page2 = client.get("/api/artifacts", params={"limit": 2, "offset": 2})
    assert page2.status_code == 200
    body2 = page2.json()
    assert body2["offset"] == 2
    assert body2["has_more"] is True
    assert len(body2["items"]) == 2

    page3 = client.get("/api/artifacts", params={"limit": 2, "offset": 4})
    assert page3.status_code == 200
    body3 = page3.json()
    assert body3["has_more"] is False
    assert len(body3["items"]) == 1

    titles = [row["title"] for row in body1["items"] + body2["items"] + body3["items"]]
    assert titles == ["Note 4", "Note 3", "Note 2", "Note 1", "Note 0"]


def test_list_accessible_artifacts_filters_and_sorts_server_side(
    tmp_path: Path, monkeypatch
) -> None:
    artifact_root = tmp_path / "arts"
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    get_settings.cache_clear()

    client = TestClient(create_app())
    _bootstrap(client)
    task_a = client.post("/api/tasks", json={"title": "Alpha board", "priority": 2})
    task_b = client.post("/api/tasks", json={"title": "Beta board", "priority": 2})
    assert task_a.status_code == 201
    assert task_b.status_code == 201
    a_id = task_a.json()["id"]
    b_id = task_b.json()["id"]

    assert (
        client.post(
            f"/api/tasks/{a_id}/artifacts",
            json={"kind": "text", "title": "Zebra note", "content_text": "alpha text"},
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/api/tasks/{a_id}/artifacts",
            json={
                "kind": "link",
                "title": "Docs link",
                "content_text": "https://example.com/docs",
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/api/tasks/{b_id}/artifacts",
            json={
                "kind": "file",
                "title": "Report.pdf",
                "content_base64": base64.b64encode(b"pdf").decode(),
                "content_type": "application/pdf",
            },
        ).status_code
        == 201
    )

    by_kind = client.get("/api/artifacts", params={"kind": "link", "limit": 10})
    assert by_kind.status_code == 200
    kind_body = by_kind.json()
    assert kind_body["total"] == 1
    assert kind_body["items"][0]["title"] == "Docs link"
    assert kind_body["kind_counts"]["all"] == 3
    assert kind_body["kind_counts"]["link"] == 1
    assert kind_body["kind_counts"]["text"] == 1
    assert kind_body["kind_counts"]["file"] == 1

    by_q = client.get("/api/artifacts", params={"q": "Beta", "limit": 10})
    assert by_q.status_code == 200
    q_body = by_q.json()
    assert q_body["total"] == 1
    assert q_body["items"][0]["title"] == "Report.pdf"

    by_name = client.get("/api/artifacts", params={"sort": "name", "limit": 10})
    assert by_name.status_code == 200
    names = [row["title"] for row in by_name.json()["items"]]
    assert names == sorted(names)

    mine = client.get("/api/artifacts", params={"mine": True, "limit": 10})
    assert mine.status_code == 200
    assert mine.json()["total"] == 3

    by_size = client.get("/api/artifacts", params={"sort": "largest", "limit": 10})
    assert by_size.status_code == 200
    sizes = [row["byte_size"] for row in by_size.json()["items"]]
    assert sizes == sorted(sizes, reverse=True)


def test_file_artifact_heals_zero_byte_size_from_storage(
    tmp_path: Path, monkeypatch
) -> None:
    """Rows stuck at byte_size=0 (pre-column default) heal on list/get/detail."""
    artifact_root = tmp_path / "arts"
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    get_settings.cache_clear()

    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)
    payload = b"legacy-pdf-bytes"
    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "Legacy.pdf",
            "content_base64": base64.b64encode(payload).decode(),
            "content_type": "application/pdf",
        },
    )
    assert created.status_code == 201
    artifact_id = created.json()["id"]
    assert created.json()["byte_size"] == len(payload)

    db = database.SessionLocal()
    try:
        row = db.get(Artifact, artifact_id)
        assert row is not None
        row.byte_size = 0
        db.commit()
    finally:
        db.close()

    listed = client.get(f"/api/tasks/{task_id}/artifacts")
    assert listed.status_code == 200
    assert listed.json()[0]["byte_size"] == len(payload)

    db = database.SessionLocal()
    try:
        assert db.get(Artifact, artifact_id).byte_size == len(payload)
        db.get(Artifact, artifact_id).byte_size = 0
        db.commit()
    finally:
        db.close()

    got = client.get(f"/api/tasks/{task_id}/artifacts/{artifact_id}")
    assert got.status_code == 200
    assert got.json()["byte_size"] == len(payload)

    db = database.SessionLocal()
    try:
        db.get(Artifact, artifact_id).byte_size = 0
        db.commit()
    finally:
        db.close()

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    assert detail.json()["artifacts"][0]["byte_size"] == len(payload)

    db = database.SessionLocal()
    try:
        db.get(Artifact, artifact_id).byte_size = 0
        db.commit()
    finally:
        db.close()

    library = client.get("/api/artifacts", params={"kind": "file"})
    assert library.status_code == 200
    assert library.json()["items"][0]["byte_size"] == len(payload)
