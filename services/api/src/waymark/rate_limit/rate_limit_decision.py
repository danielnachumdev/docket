from dataclasses import dataclass


@dataclass(frozen=True)
class RateLimitDecision:
    """Outcome of a single rate-limit check."""

    allowed: bool
    limit: int
    remaining: int
    retry_after_seconds: int
