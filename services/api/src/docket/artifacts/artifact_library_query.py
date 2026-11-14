from dataclasses import dataclass

_VALID_KINDS = frozenset({"text", "link", "file", "json"})
_VALID_SORTS = frozenset(
    {"newest", "oldest", "largest", "smallest", "name", "task"}
)


@dataclass(frozen=True)
class ArtifactLibraryQuery:
    """Normalized library list filters, sort, and page window."""

    kind: str | None
    q: str
    sort: str
    mine: bool
    offset: int
    limit: int

    @classmethod
    def from_params(
        cls,
        *,
        kind: str | None,
        q: str | None,
        sort: str | None,
        mine: bool,
        offset: int,
        limit: int,
    ) -> "ArtifactLibraryQuery":
        normalized_kind = (kind or "").strip().lower() or None
        if normalized_kind in {None, "all"}:
            normalized_kind = None
        elif normalized_kind not in _VALID_KINDS:
            normalized_kind = None
        normalized_sort = (sort or "newest").strip().lower()
        if normalized_sort not in _VALID_SORTS:
            normalized_sort = "newest"
        return cls(
            kind=normalized_kind,
            q=(q or "").strip(),
            sort=normalized_sort,
            mine=mine,
            offset=max(0, offset),
            limit=limit,
        )
