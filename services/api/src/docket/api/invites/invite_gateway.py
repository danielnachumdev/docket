from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import RegistrationInvite


class InviteGateway:
    """Raw persistence for registration invites."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, invite: RegistrationInvite) -> RegistrationInvite:
        self._db.add(invite)
        self._db.flush()
        return invite

    def get(self, invite_id: int) -> RegistrationInvite | None:
        return self._db.get(RegistrationInvite, invite_id)

    def by_token_hash(self, token_hash: str) -> RegistrationInvite | None:
        return self._db.scalar(
            select(RegistrationInvite).where(RegistrationInvite.token_hash == token_hash)
        )

    def list_all(self) -> list[RegistrationInvite]:
        return list(
            self._db.scalars(
                select(RegistrationInvite).order_by(RegistrationInvite.id.desc())
            ).all()
        )

    def delete(self, invite: RegistrationInvite) -> None:
        self._db.delete(invite)
