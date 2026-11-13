import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.api.invites.invite_gateway import InviteGateway
from docket.auth.principal import Principal
from docket.models import Membership, RegistrationInvite, Role, User
from docket.notifications import notification_dispatcher
from docket.schemas.invites import InviteCreate, InviteCreatedOut, InviteOut, InvitePreviewOut
from docket.security import api_token_hasher, password_hasher, password_policy

INVITE_TTL = timedelta(days=7)


class InviteService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._gateway = InviteGateway(db)

    def list_invites(self) -> list[InviteOut]:
        return [self._out(row) for row in self._gateway.list_all()]

    def create(self, principal: Principal, body: InviteCreate) -> InviteCreatedOut:
        email = self._normalize_optional_email(body.email)
        raw = secrets.token_urlsafe(32)
        invite = RegistrationInvite(
            created_by_user_id=principal.user_id,
            token_hash=api_token_hasher.hash(raw),
            email=email,
            expires_at=datetime.now(UTC) + INVITE_TTL,
        )
        self._gateway.add(invite)
        self._db.commit()
        self._db.refresh(invite)
        base = self._out(invite)
        return InviteCreatedOut(
            **base.model_dump(),
            token=raw,
            register_path=f"/register?token={raw}",
        )

    def revoke(self, invite_id: int) -> None:
        invite = self._require_invite(invite_id)
        if invite.consumed_at is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Invite already consumed"
            )
        self._gateway.delete(invite)
        self._db.commit()

    def preview(self, raw_token: str) -> InvitePreviewOut:
        invite = self._usable_invite(raw_token)
        return InvitePreviewOut(
            valid=True,
            email=invite.email,
            email_bound=invite.email is not None,
            expires_at=invite.expires_at,
        )

    def register(
        self, *, token: str, email: str, display_name: str, password: str
    ) -> User:
        invite = self._usable_invite(token)
        normalized = email.strip().lower()
        self._assert_email_matches_bind(invite, normalized)
        password_policy.validate(password, email=normalized)
        self._assert_email_available(normalized)

        member_role = self._db.scalar(select(Role).where(Role.name == "member"))
        if member_role is None:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR, "RBAC not seeded"
            )

        user = User(
            email=normalized,
            display_name=display_name.strip(),
            password_hash=password_hasher.hash(password),
        )
        self._db.add(user)
        self._db.flush()
        self._db.add(
            Membership(
                user_id=user.id,
                role_id=member_role.id,
                scope_type="global",
                scope_task_id=None,
            )
        )
        invite.consumed_at = datetime.now(UTC)
        invite.consumed_by_user_id = user.id
        self._notify_inviter(invite, user)
        self._db.commit()
        self._db.refresh(user)
        return user

    def _notify_inviter(self, invite: RegistrationInvite, user: User) -> None:
        notification_dispatcher(self._db).notify_user(
            user_id=invite.created_by_user_id,
            actor_user_id=user.id,
            kind="invite_accepted",
            title=f"{user.display_name} accepted your invite",
            body=f"{user.email} joined Docket.",
            payload={
                "invite_id": invite.id,
                "user_id": user.id,
                "email": user.email,
            },
        )

    def _usable_invite(self, raw_token: str) -> RegistrationInvite:
        invite = self._gateway.by_token_hash(api_token_hasher.hash(raw_token))
        if invite is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found")
        if invite.consumed_at is not None:
            raise HTTPException(status.HTTP_410_GONE, "Invite already used")
        expires = invite.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if expires <= datetime.now(UTC):
            raise HTTPException(status.HTTP_410_GONE, "Invite expired")
        return invite

    def _require_invite(self, invite_id: int) -> RegistrationInvite:
        invite = self._gateway.get(invite_id)
        if invite is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found")
        return invite

    def _assert_email_matches_bind(
        self, invite: RegistrationInvite, email: str
    ) -> None:
        if invite.email is None:
            return
        if invite.email != email:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Email must match the invitation",
            )

    def _assert_email_available(self, email: str) -> None:
        existing = self._db.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    @staticmethod
    def _normalize_optional_email(email: str | None) -> str | None:
        if email is None:
            return None
        cleaned = email.strip().lower()
        return cleaned or None

    @staticmethod
    def _out(invite: RegistrationInvite) -> InviteOut:
        return InviteOut(
            id=invite.id,
            email=invite.email,
            expires_at=invite.expires_at,
            consumed_at=invite.consumed_at,
            consumed_by_user_id=invite.consumed_by_user_id,
            created_at=invite.created_at,
        )
