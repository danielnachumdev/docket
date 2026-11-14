from dataclasses import dataclass

from docket.models import Artifact, Task


@dataclass(frozen=True)
class ArtifactLibraryPage:
    """One page of accessible artifacts plus totals for the active filters."""

    rows: list[tuple[Artifact, Task]]
    total: int
    offset: int
    limit: int
    kind_counts: dict[str, int]

    @property
    def has_more(self) -> bool:
        return self.offset + len(self.rows) < self.total
