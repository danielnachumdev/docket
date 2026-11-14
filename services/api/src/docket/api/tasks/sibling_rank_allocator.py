from docket.models import Task

RANK_GAP = 1000.0
_MIN_GAP = 1e-6


class SiblingRankAllocator:
    """Fractional ranks within a sibling list (lower rank = higher in queue)."""

    def append_rank(self, max_rank: float | None) -> float:
        if max_rank is None:
            return RANK_GAP
        return float(max_rank) + RANK_GAP

    def insert_rank(
        self, prev_rank: float | None, next_rank: float | None
    ) -> float | None:
        """Return a rank between neighbors, or None when the gap needs rebalance."""
        if prev_rank is None and next_rank is None:
            return RANK_GAP
        if prev_rank is None:
            assert next_rank is not None
            candidate = float(next_rank) / 2.0
            if candidate <= 0 or float(next_rank) - candidate < _MIN_GAP:
                return None
            return candidate
        if next_rank is None:
            return float(prev_rank) + RANK_GAP
        gap = float(next_rank) - float(prev_rank)
        if gap < _MIN_GAP * 2:
            return None
        mid = (float(prev_rank) + float(next_rank)) / 2.0
        if mid <= float(prev_rank) or mid >= float(next_rank):
            return None
        return mid

    def reindex(self, ordered: list[Task]) -> None:
        for index, task in enumerate(ordered):
            task.rank = RANK_GAP * (index + 1)
