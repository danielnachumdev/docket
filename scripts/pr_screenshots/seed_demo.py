#!/usr/bin/env python3
"""Seed a local Waymark API with PII-safe dummy data for SPA PR screenshots.

Talks only to a running local API (default http://127.0.0.1:8000). Never points
at prod. Uses example.com emails and fabricated task titles only.

Usage:
  python3 scripts/pr_screenshots/seed_demo.py
  WAYMARK_API_URL=http://127.0.0.1:8000 python3 scripts/pr_screenshots/seed_demo.py

Env (all optional):
  WAYMARK_API_URL          default http://127.0.0.1:8000
  WAYMARK_DEMO_EMAIL       owner email (default ops@example.com)
  WAYMARK_DEMO_PASSWORD    owner password (default password1234, min 12)
  WAYMARK_DEMO_NAME        owner display name (default Demo Owner)
  WAYMARK_DEMO_INVITEE_EMAIL / _PASSWORD / _NAME  second user (alex@example.com)
  WAYMARK_DEMO_STATE       path for state JSON (default /tmp/waymark-pr-demo/state.json)
"""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any


API = os.environ.get("WAYMARK_API_URL", "http://127.0.0.1:8000").rstrip("/")
OWNER_EMAIL = os.environ.get("WAYMARK_DEMO_EMAIL", "ops@example.com")
OWNER_PASSWORD = os.environ.get("WAYMARK_DEMO_PASSWORD", "password1234")
OWNER_NAME = os.environ.get("WAYMARK_DEMO_NAME", "Demo Owner")
INVITEE_EMAIL = os.environ.get("WAYMARK_DEMO_INVITEE_EMAIL", "alex@example.com")
INVITEE_PASSWORD = os.environ.get("WAYMARK_DEMO_INVITEE_PASSWORD", "password1234")
INVITEE_NAME = os.environ.get("WAYMARK_DEMO_INVITEE_NAME", "Alex Demo")
STATE_PATH = Path(
    os.environ.get("WAYMARK_DEMO_STATE", "/tmp/waymark-pr-demo/state.json")
)

# Deterministic external_ids → create is idempotent per owner.
DEMO_TASKS: list[dict[str, Any]] = [
    {
        "external_id": "demo:triage-inbox",
        "title": "Triage demo inbox",
        "body": "Fabricated backlog item for SPA screenshots. No real operators.",
        "priority": 2,
        "status": "in_progress",
    },
    {
        "external_id": "demo:ship-artifacts",
        "title": "Attach sample artifacts",
        "body": "Demo task with text + link artifacts for the Artifacts page.",
        "priority": 3,
        "status": "backlog",
        "artifacts": [
            {
                "kind": "text",
                "title": "Demo notes.txt",
                "content_text": "Sample notes for PR Proof screenshots.\n",
            },
            {
                "kind": "link",
                "title": "Demo docs with screenshot",
                "content_text": "https://docs.example.com/waymark-demo",
                "content_type": "image/png",
                # Fabricated 480x270 teal PNG for link+screenshot Proof shots
                "content_base64": "iVBORw0KGgoAAAANSUhEUgAAAeAAAAEOCAIAAADe+FMwAAAD40lEQVR42u3UsQ0AEABEUUMYwkxqg6lNpxSVDZSIvORNcLn8EHMB4EHBBAACDYBAAwg0AAININAACDQAAg0g0AAINIBAAyDQAAg0gEADINAAAg2AQAMINAACDYBAAwg0AAININAACDQAAg0g0AAINIBAAyDQAAINgEADINAAAg2AQAMINABXA51qA+BBAg0g0AAINIBAAyDQAAINgEADINAAAg2AQAMINAACDYBAAwg0AAININAACDSAQAMg0AAINIBAAyDQAAINgEADINAAAg2AQAMINAACDSDQAAg0AAININAACDSAQAMg0AAINIBAAyDQAAINgEADCLQJAAQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKABEGj2+pic4WwINAIt0Ag0Ao1AI9AItEAj0Ag0Ao1AI9ACDQKNQAs0Ao1AI9AINAIt0Ag0Ao1AI9AItEAj0CDQAo1AI9AINAKNQAs0Ao1AI9AINAIt0Ag0Ao1AI9AItECDQCPQAo1AI9AINAKNQAs0Ao1AI9AINAIt0Ag0CLRAI9AINAKNQCPQAo1AI9AINAKNQAs0Ao1AI9AINAIt0CDQCLRAI9AINAKNQCPQAo1AI9AINAKNQAs0Ag0CLdAINAKNQCPQCLRAI9AINAKNQCPQAo1Ag0ALNAKNQAu0vyHQCLRAI9AINAKNQCPQAo1AI9AINAKNQAs0CDQCLdAINAKNQCPQCLRAI9AINAKNQCPQAo1Ag0ALNAKNQCPQCDQCLdAINAKNQCPQCLRAI9AINAKNQCPQAg0CjUALNAKNQCPQCDQCLdAINAKNQCPQCLRAI9Ag0AKNQCPQCDQCjUALNAKNQCPQCDQCLdAINAKNQCPQCLRAg0Aj0AKNQCPQCDQCjUALNAKNQCPQCDQCLdAINAi0QCPQCDQCjUAj0AKNQCPQCDQCjUALNAINuinQCDQCLdD+hkAj0AKNQCPQCDQCjUALNAKNQCPQCDQCLdAg0Ai0QCPQCDQCjUAj0AKNQAMg0AACDYBAAyDQAAINgEADCDQAAg2AQAMINAACDSDQAAg0gEADINAACDSAQAMg0AACDYBAAyDQAAINgEADCDQAAg0g0AAINAACDSDQAAg0gEADINAACDSAQAMg0AACDYBAAwi0CQAEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgAgbYCgEADINAAAg2AQAMINAACDYBAAwg0AAIN8K8FKzaA0s7XmU8AAAAASUVORK5CYII=",
            },
            {
                "kind": "file",
                "title": "demo-readme.md",
                "content_type": "text/markdown",
                "content_base64": base64.b64encode(
                    b"# Demo artifact\n\nFabricated file for screenshots.\n"
                ).decode("ascii"),
            },
            {
                "kind": "file",
                "title": "demo-task-notes.txt",
                "content_type": "text/plain; charset=utf-8",
                # Long lines + RTL mix to prove plain-text preview stays contained.
                "content_base64": base64.b64encode(
                    (
                        "Task: shower cleanup (filtered text copy)\n"
                        "Google Doc path: My Drive > instinct > tasks > "
                        "demo-very-long-unbroken-token-"
                        + ("x" * 120)
                        + "\n"
                        "משימה: ניקוי מקלחון — שורת טקסט ארוכה לבדיקת גלישה "
                        "https://docs.example.com/demo/shower-cleanup-notes\n"
                        "Created: 12.11.2024\n"
                    ).encode("utf-8")
                ).decode("ascii"),
            },
        ],
        "share_with_invitee": True,
        "share_role": "editor",
    },
    {
        "external_id": "demo:blocked-deps",
        "title": "Blocked on demo dependency",
        "body": "Shows blocked status chip in the task list.",
        "priority": 1,
        "status": "blocked",
        "status_reason": "Waiting on ACME API credentials",
    },
    {
        "external_id": "demo:on-hold-budget",
        "title": "On hold until budget review",
        "body": "Shows on-hold status reason in the task list.",
        "priority": 2,
        "status": "on_hold",
        "status_reason": "Paused until Q2 budget sign-off",
    },
    {
        "external_id": "demo:shared-review",
        "title": "Shared review checklist",
        "body": "Shared with Alex Demo so People / shared badges look populated.",
        "priority": 3,
        "status": "backlog",
        "share_with_invitee": True,
        "share_role": "viewer",
        "comment": "Demo comment from owner — safe for screenshots.",
    },
    {
        "external_id": "demo:done-example",
        "title": "Completed demo chore",
        "body": "Done status for filter chips.",
        "priority": 4,
        "status": "done",
    },
    {
        "external_id": "demo:failed-retry",
        "title": "Failed demo retry",
        "body": "Failed status for Progress page stats screenshots.",
        "priority": 2,
        "status": "failed",
    },
    {
        "external_id": "demo:done-priority",
        "title": "Shipped P1 demo milestone",
        "body": "High-priority completion for Progress throughput.",
        "priority": 1,
        "status": "done",
    },
    {
        "external_id": "demo:parent-outline",
        "title": "Demo parent outline",
        "body": "Hierarchy parent for flat-queue parent-chip screenshots.",
        "priority": 3,
        "status": "backlog",
    },
    {
        "external_id": "demo:subtask-prep",
        "title": "Prep demo subtask",
        "body": "Child task ordered in the global queue; shows parent chip on Tasks.",
        "priority": 2,
        "status": "in_progress",
        "parent_external_id": "demo:parent-outline",
        # Place before triage so the flat list shows a child ahead of an unrelated root.
        "reorder_before_external_id": "demo:triage-inbox",
    },
]


class ApiClient:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        ok: tuple[int, ...] = (200, 201, 204),
    ) -> Any:
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            f"{self.base}{path}", data=data, headers=headers, method=method
        )
        try:
            with self.opener.open(req, timeout=30) as resp:
                raw = resp.read()
                code = resp.status
                if code not in ok:
                    raise SystemExit(f"{method} {path} → HTTP {code}: {raw[:400]!r}")
                if not raw or code == 204:
                    return None
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            if exc.code not in ok:
                raise SystemExit(
                    f"{method} {path} → HTTP {exc.code}: {raw[:400]!r}"
                ) from None
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))
        except urllib.error.URLError as exc:
            raise SystemExit(
                f"Cannot reach {self.base} ({exc.reason}). "
                "Start the API: cd services/api && uv run waymark"
            ) from None


def ensure_owner(client: ApiClient) -> dict[str, Any]:
    status = client.request("GET", "/api/auth/status")
    if not status.get("bootstrapped"):
        print(f"bootstrap owner {OWNER_EMAIL}")
        return client.request(
            "POST",
            "/api/auth/bootstrap",
            {
                "email": OWNER_EMAIL,
                "display_name": OWNER_NAME,
                "password": OWNER_PASSWORD,
            },
        )

    try:
        user = client.request(
            "POST",
            "/api/auth/login",
            {"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        )
    except SystemExit as exc:
        raise SystemExit(
            f"{exc}\n"
            f"Local API is already bootstrapped but login as {OWNER_EMAIL} failed.\n"
            "Use a throwaway SQLite (or set WAYMARK_DEMO_EMAIL / WAYMARK_DEMO_PASSWORD "
            "to match the existing owner). Never seed prod."
        ) from None

    if user.get("display_name") != OWNER_NAME:
        user = client.request(
            "PATCH", "/api/auth/me", {"display_name": OWNER_NAME}
        )
    print(f"logged in as owner {user.get('email')}")
    return user


def ensure_invitee(client: ApiClient) -> dict[str, Any]:
    """Register alex via invite when missing; otherwise leave owner session as-is."""
    # Probe: try login as invitee in a fresh client so we do not clobber owner cookies.
    probe = ApiClient(API)
    try:
        user = probe.request(
            "POST",
            "/api/auth/login",
            {"email": INVITEE_EMAIL, "password": INVITEE_PASSWORD},
            ok=(200,),
        )
        print(f"invitee already exists: {user.get('email')}")
        return user
    except SystemExit:
        pass

    invite = client.request(
        "POST", "/api/invites", {"email": INVITEE_EMAIL}
    )
    token = invite["token"]
    register_client = ApiClient(API)
    user = register_client.request(
        "POST",
        "/api/auth/register",
        {
            "token": token,
            "email": INVITEE_EMAIL,
            "display_name": INVITEE_NAME,
            "password": INVITEE_PASSWORD,
        },
    )
    print(f"registered invitee {user.get('email')}")
    return user


def ensure_task(
    client: ApiClient,
    spec: dict[str, Any],
    *,
    parent_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": spec["title"],
        "body": spec.get("body"),
        "priority": spec.get("priority", 3),
        "external_id": spec["external_id"],
    }
    if parent_id is not None:
        payload["parent_task_id"] = parent_id
    task = client.request("POST", "/api/tasks", payload)
    desired = spec.get("status")
    reason = spec.get("status_reason")
    needs_status = desired and task.get("status") != desired
    needs_reason = reason is not None and task.get("status_reason") != reason
    if desired and (needs_status or needs_reason):
        body: dict[str, Any] = {"status": desired}
        if reason is not None:
            body["reason"] = reason
        client.request("POST", f"/api/tasks/{task['id']}/status", body)
        task = client.request("GET", f"/api/tasks/{task['id']}")["task"]
    return task


def ensure_artifacts(client: ApiClient, task_id: str, artifacts: list[dict[str, Any]]) -> None:
    existing = client.request("GET", f"/api/tasks/{task_id}/artifacts")
    titles = {a.get("title") for a in existing}
    for art in artifacts:
        if art["title"] in titles:
            continue
        body = {k: v for k, v in art.items()}
        client.request("POST", f"/api/tasks/{task_id}/artifacts", body)
        print(f"  + artifact {art['title']}")


def ensure_share(client: ApiClient, task_id: str, email: str, role: str) -> None:
    shares = client.request("GET", f"/api/tasks/{task_id}/shares")
    if any((s.get("email") or "").lower() == email.lower() for s in shares):
        return
    client.request(
        "POST",
        f"/api/tasks/{task_id}/shares",
        {"email": email, "role": role},
    )
    print(f"  + shared with {email} as {role}")


def ensure_comment(client: ApiClient, task_id: str, body: str) -> None:
    comments = client.request("GET", f"/api/tasks/{task_id}/comments")
    if any(c.get("body") == body for c in comments):
        return
    client.request("POST", f"/api/tasks/{task_id}/comments", {"body": body})
    print("  + demo comment")


def main() -> None:
    if len(OWNER_PASSWORD) < 12 or len(INVITEE_PASSWORD) < 12:
        raise SystemExit("demo passwords must be at least 12 characters")

    health = ApiClient(API).request("GET", "/api/health")
    if health.get("status") != "ok":
        raise SystemExit(f"unexpected /api/health: {health}")

    client = ApiClient(API)
    owner = ensure_owner(client)
    invitee = ensure_invitee(client)

    # Owner session may have been interrupted only if we switched clients; re-login.
    client.request(
        "POST",
        "/api/auth/login",
        {"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
    )

    tasks_out: dict[str, str] = {}
    detail_id: str | None = None
    for spec in DEMO_TASKS:
        parent_ext = spec.get("parent_external_id")
        parent_id = tasks_out.get(parent_ext) if parent_ext else None
        if parent_ext and parent_id is None:
            raise SystemExit(f"parent {parent_ext} must appear before {spec['external_id']}")
        task = ensure_task(client, spec, parent_id=parent_id)
        tid = task["id"]
        tasks_out[spec["external_id"]] = tid
        print(f"task {spec['external_id']} → {tid} ({task.get('status')})")
        before_ext = spec.get("reorder_before_external_id")
        if before_ext:
            before_id = tasks_out.get(before_ext)
            if before_id is None:
                raise SystemExit(f"reorder anchor {before_ext} missing for {spec['external_id']}")
            client.request(
                "POST",
                f"/api/tasks/{tid}/reorder",
                {"before_task_id": before_id},
            )
            print(f"  ↺ reordered before {before_ext}")
        if spec.get("artifacts"):
            ensure_artifacts(client, tid, spec["artifacts"])
            detail_id = detail_id or tid
        if spec.get("share_with_invitee"):
            ensure_share(
                client,
                tid,
                INVITEE_EMAIL,
                spec.get("share_role", "viewer"),
            )
            detail_id = detail_id or tid
        if spec.get("comment"):
            ensure_comment(client, tid, spec["comment"])

    if detail_id is None and tasks_out:
        detail_id = next(iter(tasks_out.values()))

    state = {
        "api_url": API,
        "owner_email": OWNER_EMAIL,
        "invitee_email": INVITEE_EMAIL,
        "owner_id": owner.get("id"),
        "invitee_id": invitee.get("id"),
        "tasks": tasks_out,
        "detail_task_id": detail_id,
        "note": "Fabricated demo data only — not for production.",
    }
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {STATE_PATH}")
    print(json.dumps({"detail_task_id": detail_id, "task_count": len(tasks_out)}))


if __name__ == "__main__":
    main()
