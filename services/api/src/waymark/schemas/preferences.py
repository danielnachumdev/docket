from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ThemePreference = Literal["light", "dark"]
LocalePreference = Literal["en", "he"]

ALLOWED_THEMES: frozenset[str] = frozenset({"light", "dark"})
ALLOWED_LOCALES: frozenset[str] = frozenset({"en", "he"})
KNOWN_PREFERENCE_KEYS: frozenset[str] = frozenset({"theme", "locale"})


class UserPreferencesOut(BaseModel):
    """Allowlisted per-user preferences. Missing keys are null."""

    theme: ThemePreference | None = None
    locale: LocalePreference | None = None


class UserPreferencesPatch(BaseModel):
    """Merge-patch body. Unknown keys are rejected (extra=forbid → 422)."""

    model_config = ConfigDict(extra="forbid")

    theme: ThemePreference | None = Field(default=None)
    locale: LocalePreference | None = Field(default=None)
