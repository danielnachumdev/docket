import json
import statistics
from collections import Counter
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from waymark.api.me_stats.me_stats_gateway import MeStatsGateway
from waymark.models import Task, TaskEvent
from waymark.schemas.user_stats import (
    ActorMixStatsOut,
    BlockedStatsOut,
    ClaimsStatsOut,
    CompletionRateStatsOut,
    CycleTimeStatsOut,
    DayCountOut,
    FailedStatsOut,
    OutcomesStatsOut,
    PriorityStatsOut,
    SharedStatsOut,
    StreakStatsOut,
    ThroughputStatsOut,
    UserStatsOut,
    WipStatsOut,
)

_TERMINAL_DONE_CANCELLED = frozenset({"done", "cancelled"})


class MeStatsService:
    def __init__(self, db: Session) -> None:
        self._gateway = MeStatsGateway(db)

    def build(self, user_id: int, *, window_days: int) -> UserStatsOut:
        now = datetime.now(UTC)
        window_start = now - timedelta(days=window_days)
        prior_start = window_start - timedelta(days=window_days)

        owned = self._gateway.owned_tasks(user_id)
        accessible = self._gateway.accessible_tasks(user_id)
        shared_ids = self._gateway.shared_membership_task_ids(user_id)

        owned_completed = [
            t for t in owned if self._in_range(t.completed_at, window_start, now)
        ]
        prior_completed = [
            t for t in owned if self._in_range(t.completed_at, prior_start, window_start)
        ]
        completed_count = len(owned_completed)
        prior_count = len(prior_completed)

        done_n = completed_count
        cancelled_n = sum(
            1 for t in owned if self._in_range(t.cancelled_at, window_start, now)
        )
        failed_in_window = sum(
            1
            for t in owned
            if t.status == "failed" and self._in_range(t.updated_at, window_start, now)
        )
        denom = done_n + failed_in_window + cancelled_n
        rate = (done_n / denom) if denom else None

        wip_tasks = [
            t
            for t in owned
            if t.archived_at is None and t.status not in _TERMINAL_DONE_CANCELLED
        ]
        age_7 = now - timedelta(days=7)
        age_30 = now - timedelta(days=30)

        blocked_count = sum(1 for t in wip_tasks if t.status == "blocked")
        failed_current = sum(1 for t in wip_tasks if t.status == "failed")

        p1_p2_open = sum(1 for t in wip_tasks if t.priority <= 2)
        p1_p2_done = sum(1 for t in owned_completed if t.priority <= 2)

        cycle = self._cycle_time(owned_completed)
        streak = self._streak(owned, window_start, now)
        actor_mix = self._actor_mix(owned, window_start, now)
        claims = self._claims(accessible, now)
        outcomes = self._outcomes(owned_completed)
        shared = self._shared(owned_completed, accessible, shared_ids, user_id, window_start, now)
        by_day = self._completions_by_day(owned, window_days=window_days, now=now)

        return UserStatsOut(
            window_days=window_days,
            generated_at=now,
            throughput=ThroughputStatsOut(
                completed=completed_count,
                prior_completed=prior_count,
                delta=completed_count - prior_count,
            ),
            completion_rate=CompletionRateStatsOut(
                done=done_n,
                failed=failed_in_window,
                cancelled=cancelled_n,
                rate=rate,
            ),
            cycle_time=cycle,
            wip=WipStatsOut(
                open=len(wip_tasks),
                open_older_than_7d=sum(
                    1 for t in wip_tasks if self._as_utc(t.created_at) < age_7
                ),
                open_older_than_30d=sum(
                    1 for t in wip_tasks if self._as_utc(t.created_at) < age_30
                ),
            ),
            blocked=BlockedStatsOut(count=blocked_count),
            failed=FailedStatsOut(count=failed_current, in_window=failed_in_window),
            priority=PriorityStatsOut(
                p1_p2_open=p1_p2_open,
                p1_p2_done_in_window=p1_p2_done,
            ),
            streak=streak,
            actor_mix=actor_mix,
            claims=claims,
            outcomes=outcomes,
            shared=shared,
            completions_by_day=by_day,
        )

    def _cycle_time(self, completed: list[Task]) -> CycleTimeStatsOut:
        if not completed:
            return CycleTimeStatsOut(sample_size=0, median_hours=None)
        events = self._gateway.first_in_progress_events([t.id for t in completed])
        first_ip: dict[int, datetime] = {}
        for event in events:
            if event.task_id in first_ip:
                continue
            if self._event_to_status(event) != "in_progress":
                continue
            first_ip[event.task_id] = self._as_utc(event.created_at)
        hours: list[float] = []
        for task in completed:
            start = first_ip.get(task.id)
            completed_at = task.completed_at
            if start is None or completed_at is None:
                continue
            delta = self._as_utc(completed_at) - start
            hours.append(delta.total_seconds() / 3600.0)
        if not hours:
            return CycleTimeStatsOut(sample_size=0, median_hours=None)
        return CycleTimeStatsOut(
            sample_size=len(hours),
            median_hours=round(float(statistics.median(hours)), 2),
        )

    def _streak(
        self, owned: list[Task], window_start: datetime, now: datetime
    ) -> StreakStatsOut:
        dates = sorted(
            {
                self._as_utc(t.completed_at).date()
                for t in owned
                if t.completed_at is not None
            },
            reverse=True,
        )
        date_set = set(dates)
        today = now.date()
        yesterday = today - timedelta(days=1)
        if today in date_set:
            cursor = today
        elif yesterday in date_set:
            cursor = yesterday
        else:
            cursor = None
        current = 0
        while cursor is not None and cursor in date_set:
            current += 1
            cursor = cursor - timedelta(days=1)

        active = {
            self._as_utc(t.completed_at).date()
            for t in owned
            if self._in_range(t.completed_at, window_start, now)
        }
        return StreakStatsOut(
            current_days=current,
            active_days_in_window=len(active),
        )

    def _actor_mix(
        self, owned: list[Task], window_start: datetime, now: datetime
    ) -> ActorMixStatsOut:
        # Look back slightly before window so we do not miss edge events; filter below.
        events = self._gateway.status_changed_events_for_tasks(
            [t.id for t in owned], since=window_start
        )
        agent = 0
        human = 0
        for event in events:
            if not self._in_range(event.created_at, window_start, now):
                continue
            if self._event_to_status(event) != "done":
                continue
            if event.actor_token_id is not None:
                agent += 1
            else:
                human += 1
        return ActorMixStatsOut(agent_completions=agent, human_completions=human)

    def _claims(self, accessible: list[Task], now: datetime) -> ClaimsStatsOut:
        active = 0
        expired = 0
        for task in accessible:
            if task.claimed_by_token_id is None:
                continue
            expires = task.claim_expires_at
            if expires is None:
                expired += 1
                continue
            if self._as_utc(expires) >= now:
                active += 1
            else:
                expired += 1
        return ClaimsStatsOut(active=active, expired=expired)

    @staticmethod
    def _outcomes(completed: list[Task]) -> OutcomesStatsOut:
        with_outcome = sum(1 for t in completed if t.outcome_json)
        without = len(completed) - with_outcome
        return OutcomesStatsOut(with_outcome=with_outcome, without_outcome=without)

    def _completions_by_day(
        self, owned: list[Task], *, window_days: int, now: datetime
    ) -> list[DayCountOut]:
        end = now.date()
        start = end - timedelta(days=window_days - 1)
        counts: Counter[date] = Counter()
        for task in owned:
            if task.completed_at is None:
                continue
            day = self._as_utc(task.completed_at).date()
            if start <= day <= end:
                counts[day] += 1
        series: list[DayCountOut] = []
        for offset in range(window_days):
            day = start + timedelta(days=offset)
            series.append(DayCountOut(day=day, count=counts[day]))
        return series

    def _shared(
        self,
        owned_completed: list[Task],
        accessible: list[Task],
        shared_ids: set[int],
        user_id: int,
        window_start: datetime,
        now: datetime,
    ) -> SharedStatsOut:
        shared_completions = sum(
            1
            for t in accessible
            if t.id in shared_ids
            and t.owner_user_id != user_id
            and self._in_range(t.completed_at, window_start, now)
        )
        return SharedStatsOut(
            owned_completions=len(owned_completed),
            shared_with_me_completions=shared_completions,
        )

    @staticmethod
    def _event_to_status(event: TaskEvent) -> str | None:
        if not event.payload_json:
            return None
        try:
            payload = json.loads(event.payload_json)
        except json.JSONDecodeError:
            return None
        to_status = payload.get("to")
        return to_status if isinstance(to_status, str) else None

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _in_range(
        self, value: datetime | None, start: datetime, end: datetime
    ) -> bool:
        if value is None:
            return False
        ts = self._as_utc(value)
        return start <= ts < end
