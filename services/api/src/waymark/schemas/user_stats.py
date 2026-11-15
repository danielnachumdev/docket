"""Personal progress statistics response models.

Metric definitions (all UTC; primary universe = tasks the user owns unless noted):

- **window**: ``[now - window_days, now)``; prior window is the preceding
  ``window_days`` for throughput trend.
- **Throughput**: owned tasks with ``completed_at`` in the window / prior window.
  ``delta = completed - prior_completed``. Later-archived completions still count.
- **Completion rate**: terminal outcomes in the window among owned tasks:
  done = ``completed_at`` in window; cancelled = ``cancelled_at`` in window;
  failed = ``status == failed`` and ``updated_at`` in window.
  ``rate = done / (done + failed + cancelled)``; ``null`` when denominator is 0.
  Pure backlog never-started tasks are excluded.
- **Cycle time**: for owned completions in the window, median hours from the
  first ``status_changed`` event with ``payload.to == in_progress`` to
  ``completed_at``. Tasks without an in_progress event are omitted from the
  sample (``sample_size`` / ``median_hours``).
- **WIP / age**: owned, non-archived, status not in {done, cancelled}. Age uses
  ``created_at`` vs 7d / 30d thresholds (not the query window).
- **Blocked / failed**: current owned non-archived counts; ``failed.in_window``
  matches the completion-rate failed definition.
- **Priority**: among owned tasks, P1/P2 (priority ≤ 2) still open (WIP rules)
  vs completed in the window.
- **Streak**: consecutive UTC calendar days with ≥1 owned completion, soft-ending
  on today or yesterday; ``active_days_in_window`` = distinct completion dates
  in the window.
- **Actor mix**: among ``status_changed`` → done events in the window on owned
  tasks: agent = ``actor_token_id`` set; human = session-only.
- **Claims**: owned + membership-shared tasks (any archive state): active lease
  (``claimed_by_token_id`` set and ``claim_expires_at >= now``) vs expired
  (``claim_expires_at < now``).
- **Outcomes**: owned completions in the window with / without ``outcome_json``.
- **Shared**: owned completions vs completions on tasks shared with the user
  (membership, not owner) in the window.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class ThroughputStatsOut(BaseModel):
    completed: int
    prior_completed: int
    delta: int


class CompletionRateStatsOut(BaseModel):
    done: int
    failed: int
    cancelled: int
    rate: float | None


class CycleTimeStatsOut(BaseModel):
    sample_size: int
    median_hours: float | None


class WipStatsOut(BaseModel):
    open: int
    open_older_than_7d: int
    open_older_than_30d: int


class BlockedStatsOut(BaseModel):
    count: int


class FailedStatsOut(BaseModel):
    count: int
    in_window: int


class PriorityStatsOut(BaseModel):
    p1_p2_open: int
    p1_p2_done_in_window: int


class StreakStatsOut(BaseModel):
    current_days: int
    active_days_in_window: int


class ActorMixStatsOut(BaseModel):
    agent_completions: int
    human_completions: int


class ClaimsStatsOut(BaseModel):
    active: int
    expired: int


class OutcomesStatsOut(BaseModel):
    with_outcome: int
    without_outcome: int


class SharedStatsOut(BaseModel):
    owned_completions: int
    shared_with_me_completions: int


class UserStatsOut(BaseModel):
    """Per-authenticated-user progress stats. See module docstring for definitions."""

    window_days: int
    generated_at: datetime
    throughput: ThroughputStatsOut
    completion_rate: CompletionRateStatsOut
    cycle_time: CycleTimeStatsOut
    wip: WipStatsOut
    blocked: BlockedStatsOut
    failed: FailedStatsOut
    priority: PriorityStatsOut
    streak: StreakStatsOut
    actor_mix: ActorMixStatsOut
    claims: ClaimsStatsOut
    outcomes: OutcomesStatsOut
    shared: SharedStatsOut = Field(
        description="Owned vs shared-with-me completions in the window."
    )
