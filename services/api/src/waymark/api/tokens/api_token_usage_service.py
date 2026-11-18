from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from waymark.api.tokens.api_token_gateway import ApiTokenGateway
from waymark.models import ApiTokenRequestLog
from waymark.schemas.tokens import (
    TokenRequestLogOut,
    TokenRequestPageOut,
    TokenUsageBucketOut,
    TokenUsageOut,
    TokenUsagePathOut,
    TokenUsageStatusOut,
)
from waymark.token_usage.token_request_log_gateway import TokenRequestLogGateway

_TOP_PATHS = 8


class ApiTokenUsageService:
    """Owned-token usage trends and request log listing."""

    def __init__(self, db: Session) -> None:
        self._tokens = ApiTokenGateway(db)
        self._logs = TokenRequestLogGateway(db)

    def usage(self, user_id: int, token_id: int, *, window_days: int) -> TokenUsageOut:
        self._require_owned(user_id, token_id)
        days = max(1, min(window_days, 90))
        now = datetime.now(timezone.utc)
        since = now - timedelta(days=days)
        rows = self._logs.rows_in_window(token_id, since=since)
        granularity = "hour" if days <= 2 else "day"
        return TokenUsageOut(
            window_days=days,
            generated_at=now,
            granularity=granularity,
            total_requests=len(rows),
            requests_by_bucket=self._bucket_series(rows, since=since, now=now, days=days),
            status_mix=self._status_mix(rows),
            top_paths=self._top_paths(token_id, since=since),
        )

    def list_requests(
        self,
        user_id: int,
        token_id: int,
        *,
        offset: int,
        limit: int,
        window_days: int | None = None,
    ) -> TokenRequestPageOut:
        self._require_owned(user_id, token_id)
        since = None
        if window_days is not None:
            days = max(1, min(window_days, 90))
            since = datetime.now(timezone.utc) - timedelta(days=days)
        total = self._logs.count_for_token_since(token_id, since=since)
        rows = self._logs.list_for_token(
            token_id, offset=offset, limit=limit, since=since
        )
        return TokenRequestPageOut(
            total=total,
            offset=offset,
            limit=limit,
            has_more=offset + len(rows) < total,
            items=[self._request_out(row) for row in rows],
        )

    def _require_owned(self, user_id: int, token_id: int) -> None:
        token = self._tokens.get(token_id)
        if token is None or token.user_id != user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")

    def _bucket_series(
        self,
        rows: list[ApiTokenRequestLog],
        *,
        since: datetime,
        now: datetime,
        days: int,
    ) -> list[TokenUsageBucketOut]:
        if days <= 2:
            return self._hourly_buckets(rows, since=since, now=now)
        return self._daily_buckets(rows, days=days, now=now)

    def _hourly_buckets(
        self,
        rows: list[ApiTokenRequestLog],
        *,
        since: datetime,
        now: datetime,
    ) -> list[TokenUsageBucketOut]:
        counts: Counter[datetime] = Counter()
        for row in rows:
            created = self._as_utc(row.created_at)
            key = created.replace(minute=0, second=0, microsecond=0)
            counts[key] += 1
        start = self._as_utc(since).replace(minute=0, second=0, microsecond=0)
        end = self._as_utc(now).replace(minute=0, second=0, microsecond=0)
        out: list[TokenUsageBucketOut] = []
        cursor = start
        while cursor <= end:
            out.append(TokenUsageBucketOut(bucket=cursor, count=counts.get(cursor, 0)))
            cursor += timedelta(hours=1)
        return out

    def _daily_buckets(
        self,
        rows: list[ApiTokenRequestLog],
        *,
        days: int,
        now: datetime,
    ) -> list[TokenUsageBucketOut]:
        counts: Counter[date] = Counter()
        for row in rows:
            counts[self._as_utc(row.created_at).date()] += 1
        today = self._as_utc(now).date()
        start = today - timedelta(days=days - 1)
        out: list[TokenUsageBucketOut] = []
        cursor = start
        while cursor <= today:
            bucket = datetime(
                cursor.year, cursor.month, cursor.day, tzinfo=timezone.utc
            )
            out.append(
                TokenUsageBucketOut(bucket=bucket, count=counts.get(cursor, 0))
            )
            cursor += timedelta(days=1)
        return out

    def _status_mix(self, rows: list[ApiTokenRequestLog]) -> list[TokenUsageStatusOut]:
        classes: Counter[str] = Counter()
        for row in rows:
            classes[self._status_class(row.status_code)] += 1
        order = ("2xx", "3xx", "4xx", "5xx", "other")
        return [
            TokenUsageStatusOut(status_class=key, count=classes[key])
            for key in order
            if classes.get(key, 0) > 0
        ]

    def _top_paths(
        self, token_id: int, *, since: datetime
    ) -> list[TokenUsagePathOut]:
        return [
            TokenUsagePathOut(path=path, count=count)
            for path, count in self._logs.top_paths(
                token_id, since=since, limit=_TOP_PATHS
            )
        ]

    @staticmethod
    def _request_out(row: ApiTokenRequestLog) -> TokenRequestLogOut:
        return TokenRequestLogOut(
            id=row.id,
            created_at=row.created_at,
            method=row.method,
            path=row.path,
            status_code=row.status_code,
            client_ip=row.client_ip,
            user_agent=row.user_agent,
        )

    @staticmethod
    def _status_class(code: int) -> str:
        if 200 <= code < 300:
            return "2xx"
        if 300 <= code < 400:
            return "3xx"
        if 400 <= code < 500:
            return "4xx"
        if 500 <= code < 600:
            return "5xx"
        return "other"

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
