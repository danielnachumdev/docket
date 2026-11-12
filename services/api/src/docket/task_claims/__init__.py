"""Task claim / lease domain."""

from docket.task_claims.task_claim_service import (
    DEFAULT_LEASE_SECONDS,
    MAX_LEASE_SECONDS,
    TaskClaimService,
)

__all__ = [
    "DEFAULT_LEASE_SECONDS",
    "MAX_LEASE_SECONDS",
    "TaskClaimService",
]
