import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from docket.models import User
from docket.notifications.comment_ref_parser import CommentRefParser

_MENTION_RE = re.compile(r"(?<!\w)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")


class MentionResolver:
    """Resolve @email mentions in comment text to user ids."""

    def __init__(self) -> None:
        self._parser = CommentRefParser()

    def resolve_user_ids(self, db: Session, text: str) -> list[int]:
        emails = {m.group(1).lower() for m in _MENTION_RE.finditer(text)}
        if not emails:
            return []
        users = db.scalars(
            select(User).where(func.lower(User.email).in_(emails))
        ).all()
        return [u.id for u in users]

    def resolve_user_ids_from_refs(self, refs: list[dict]) -> list[int]:
        seen: set[int] = set()
        ordered: list[int] = []
        for ref in refs:
            if ref.get("kind") != "user":
                continue
            user_id = ref.get("user_id")
            if not isinstance(user_id, int) or user_id in seen:
                continue
            seen.add(user_id)
            ordered.append(user_id)
        return ordered


mention_resolver = MentionResolver()
