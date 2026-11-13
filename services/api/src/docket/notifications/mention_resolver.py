import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from docket.models import User

_MENTION_RE = re.compile(r"(?<!\w)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")


class MentionResolver:
    """Resolve @email mentions in comment text to user ids."""

    def resolve_user_ids(self, db: Session, text: str) -> list[int]:
        emails = {m.group(1).lower() for m in _MENTION_RE.finditer(text)}
        if not emails:
            return []
        users = db.scalars(
            select(User).where(func.lower(User.email).in_(emails))
        ).all()
        return [u.id for u in users]


mention_resolver = MentionResolver()
