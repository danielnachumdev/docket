import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ColorScheme = Literal["light", "dark"]
BuiltinThemeId = Literal[
    "light", "dark", "lilac", "sage", "sky", "sand", "dusk", "slate"
]
LocalePreference = Literal["en", "he"]
TaskSortMode = Literal["custom", "date"]

ALLOWED_COLOR_SCHEMES: frozenset[str] = frozenset({"light", "dark"})
ALLOWED_BUILTIN_THEMES: frozenset[str] = frozenset(
    {"light", "dark", "lilac", "sage", "sky", "sand", "dusk", "slate"}
)
# Retired builtin ids remapped on decode
_THEME_ID_ALIASES: dict[str, str] = {"pastel": "lilac"}
# Back-compat alias
ALLOWED_THEMES = ALLOWED_BUILTIN_THEMES
ALLOWED_LOCALES: frozenset[str] = frozenset({"en", "he"})
ALLOWED_TASK_SORT_MODES: frozenset[str] = frozenset({"custom", "date"})
KNOWN_PREFERENCE_KEYS: frozenset[str] = frozenset(
    {"theme", "locale", "custom_themes", "task_sort_mode"}
)

CUSTOM_THEME_ID_RE = re.compile(r"^c_[a-z0-9]{8,24}$")
_MAX_CUSTOM_THEMES = 20
_MAX_THEME_NAME_LEN = 48

# Must stay in sync with services/web/src/lib/themeTokens.ts
ALLOWED_THEME_TOKEN_KEYS: frozenset[str] = frozenset(
    {
        "bg",
        "surface",
        "surface-2",
        "surface-hover",
        "border",
        "border-strong",
        "text",
        "text-2",
        "muted",
        "accent",
        "accent-hover",
        "accent-soft",
        "accent-text",
        "danger",
        "danger-soft",
        "warning",
        "warning-soft",
        "success",
        "success-soft",
        "st-backlog",
        "st-in_progress",
        "st-blocked",
        "st-on_hold",
        "st-failed",
        "st-done",
        "st-cancelled",
        "p1",
        "p2",
        "p3",
        "p4",
        "shadow-sm",
        "shadow",
        "shadow-md",
        "shadow-lg",
    }
)

SHADOW_THEME_TOKEN_KEYS: frozenset[str] = frozenset(
    {"shadow-sm", "shadow", "shadow-md", "shadow-lg"}
)

_HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_MAX_SHADOW_LEN = 240

ThemeTokensMap = dict[str, str]


def validate_theme_token_value(key: str, value: str) -> str:
    """Return normalized token value or raise ValueError."""
    if key in SHADOW_THEME_TOKEN_KEYS:
        cleaned = value.strip()
        if not cleaned or len(cleaned) > _MAX_SHADOW_LEN:
            raise ValueError(f"invalid shadow for '{key}'")
        return cleaned
    if not _HEX_COLOR_RE.match(value.strip()):
        raise ValueError(f"invalid color for '{key}'")
    return value.strip().lower()


def is_builtin_theme_id(value: str) -> bool:
    return value in ALLOWED_BUILTIN_THEMES


def canonicalize_theme_id(value: str) -> str:
    return _THEME_ID_ALIASES.get(value, value)


def is_custom_theme_id(value: str) -> bool:
    return bool(CUSTOM_THEME_ID_RE.match(value))


class CustomThemeOut(BaseModel):
    """User-authored theme pack (full token map + display name)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    base: ColorScheme
    tokens: ThemeTokensMap


class UserPreferencesOut(BaseModel):
    """Allowlisted per-user preferences. Missing keys are null."""

    theme: str | None = None
    locale: LocalePreference | None = None
    custom_themes: list[CustomThemeOut] | None = None
    task_sort_mode: TaskSortMode | None = None


class UserPreferencesPatch(BaseModel):
    """Merge-patch body. Unknown keys are rejected (extra=forbid → 422)."""

    model_config = ConfigDict(extra="forbid")

    theme: str | None = Field(default=None)
    locale: LocalePreference | None = Field(default=None)
    custom_themes: list[dict[str, Any]] | None = Field(default=None)
    task_sort_mode: TaskSortMode | None = Field(default=None)
