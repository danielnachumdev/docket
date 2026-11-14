import threading
import time
from collections import deque

from docket.rate_limit.rate_limit_decision import RateLimitDecision


class TokenRateLimiter:
    """In-process sliding-window limiter keyed by API token id.

    Safe for a single uvicorn worker. Multi-worker deployments do not share
    counters, so effective capacity scales roughly with worker count.
    """

    def __init__(self, *, max_requests: int, window_seconds: float) -> None:
        self._max_requests = max(1, max_requests)
        self._window_seconds = max(0.001, float(window_seconds))
        self._hits: dict[int, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, token_id: int, *, now: float | None = None) -> RateLimitDecision:
        at = time.monotonic() if now is None else now
        with self._lock:
            return self._check_locked(token_id, at)

    def _check_locked(self, token_id: int, at: float) -> RateLimitDecision:
        window_start = at - self._window_seconds
        hits = self._hits.setdefault(token_id, deque())
        while hits and hits[0] <= window_start:
            hits.popleft()
        if len(hits) >= self._max_requests:
            retry_after = max(1, int(hits[0] + self._window_seconds - at) + 1)
            return RateLimitDecision(
                allowed=False,
                limit=self._max_requests,
                remaining=0,
                retry_after_seconds=retry_after,
            )
        hits.append(at)
        remaining = self._max_requests - len(hits)
        return RateLimitDecision(
            allowed=True,
            limit=self._max_requests,
            remaining=remaining,
            retry_after_seconds=0,
        )
