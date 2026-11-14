import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RawCommentToken:
    kind: str  # user | task | artifact | comment
    raw: str
    value: str
    start: int
    end: int


_TOKEN_RE = re.compile(
    r"(?<!\w)(?:"
    r"@(?P<email>[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"
    r"|@(?P<handle>[A-Za-z0-9._-]+)"
    r"|#(?P<task_pid>[A-Za-z0-9]{12})"
    r"|#(?P<task_num>\d{1,11})"
    r"|&(?P<artifact>\d+)"
    r"|~(?P<comment>\d+)"
    r")"
)


class CommentRefParser:
    """Parse shorthand tokens from plain comment text."""

    def parse(self, text: str) -> list[RawCommentToken]:
        tokens: list[RawCommentToken] = []
        for match in _TOKEN_RE.finditer(text):
            token = self._from_match(match)
            if token is not None:
                tokens.append(token)
        return tokens

    def _from_match(self, match: re.Match[str]) -> RawCommentToken | None:
        start, end = match.span()
        raw = match.group(0)
        if match.group("email"):
            return RawCommentToken("user", raw, match.group("email").lower(), start, end)
        if match.group("handle"):
            return RawCommentToken("user", raw, match.group("handle"), start, end)
        if match.group("task_num"):
            return RawCommentToken("task", raw, match.group("task_num"), start, end)
        if match.group("task_pid"):
            return RawCommentToken("task", raw, match.group("task_pid"), start, end)
        if match.group("artifact"):
            return RawCommentToken("artifact", raw, match.group("artifact"), start, end)
        if match.group("comment"):
            return RawCommentToken("comment", raw, match.group("comment"), start, end)
        return None


comment_ref_parser = CommentRefParser()
