from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from waymark.models import ApiTokenRequestLog


class TokenRequestLogGateway:
    """Raw api_token_request_logs access."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, row: ApiTokenRequestLog) -> ApiTokenRequestLog:
        self._db.add(row)
        self._db.flush()
        return row

    def delete_older_than(self, cutoff: datetime) -> int:
        result = self._db.execute(
            delete(ApiTokenRequestLog).where(ApiTokenRequestLog.created_at < cutoff)
        )
        return int(result.rowcount or 0)

    def count_for_token(self, token_id: int) -> int:
        return int(
            self._db.scalar(
                select(func.count())
                .select_from(ApiTokenRequestLog)
                .where(ApiTokenRequestLog.token_id == token_id)
            )
            or 0
        )

    def delete_oldest_excess(self, token_id: int, keep: int) -> int:
        if keep < 0:
            return 0
        excess = self.count_for_token(token_id) - keep
        if excess <= 0:
            return 0
        oldest_ids = list(
            self._db.scalars(
                select(ApiTokenRequestLog.id)
                .where(ApiTokenRequestLog.token_id == token_id)
                .order_by(
                    ApiTokenRequestLog.created_at.asc(),
                    ApiTokenRequestLog.id.asc(),
                )
                .limit(excess)
            ).all()
        )
        if not oldest_ids:
            return 0
        result = self._db.execute(
            delete(ApiTokenRequestLog).where(ApiTokenRequestLog.id.in_(oldest_ids))
        )
        return int(result.rowcount or 0)

    def list_for_token(
        self,
        token_id: int,
        *,
        offset: int,
        limit: int,
        since: datetime | None = None,
    ) -> list[ApiTokenRequestLog]:
        stmt = select(ApiTokenRequestLog).where(
            ApiTokenRequestLog.token_id == token_id
        )
        if since is not None:
            stmt = stmt.where(ApiTokenRequestLog.created_at >= since)
        stmt = stmt.order_by(
            ApiTokenRequestLog.created_at.desc(),
            ApiTokenRequestLog.id.desc(),
        ).offset(offset).limit(limit)
        return list(self._db.scalars(stmt).all())

    def count_for_token_since(
        self, token_id: int, *, since: datetime | None = None
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(ApiTokenRequestLog)
            .where(ApiTokenRequestLog.token_id == token_id)
        )
        if since is not None:
            stmt = stmt.where(ApiTokenRequestLog.created_at >= since)
        return int(self._db.scalar(stmt) or 0)

    def top_paths(
        self, token_id: int, *, since: datetime, limit: int
    ) -> list[tuple[str, int]]:
        stmt = (
            select(ApiTokenRequestLog.path, func.count().label("n"))
            .where(
                ApiTokenRequestLog.token_id == token_id,
                ApiTokenRequestLog.created_at >= since,
            )
            .group_by(ApiTokenRequestLog.path)
            .order_by(func.count().desc(), ApiTokenRequestLog.path.asc())
            .limit(limit)
        )
        return [(str(path), int(count)) for path, count in self._db.execute(stmt)]

    def rows_in_window(
        self, token_id: int, *, since: datetime
    ) -> list[ApiTokenRequestLog]:
        stmt = (
            select(ApiTokenRequestLog)
            .where(
                ApiTokenRequestLog.token_id == token_id,
                ApiTokenRequestLog.created_at >= since,
            )
            .order_by(ApiTokenRequestLog.created_at.asc())
        )
        return list(self._db.scalars(stmt).all())

    def commit(self) -> None:
        self._db.commit()
