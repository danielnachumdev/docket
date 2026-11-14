import json

from fastapi import HTTPException, status

from docket.schemas.preferences import (
    ALLOWED_LOCALES,
    ALLOWED_THEMES,
    KNOWN_PREFERENCE_KEYS,
    UserPreferencesOut,
)


class PreferencesCodec:
    """Encode/decode allowlisted preference maps stored as JSON text."""

    def decode(self, raw: str | None) -> UserPreferencesOut:
        data = self._parse_object(raw)
        return UserPreferencesOut(
            theme=self._optional_theme(data.get("theme")),
            locale=self._optional_locale(data.get("locale")),
        )

    def encode(self, prefs: UserPreferencesOut) -> str:
        payload: dict[str, str] = {}
        if prefs.theme is not None:
            payload["theme"] = prefs.theme
        if prefs.locale is not None:
            payload["locale"] = prefs.locale
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)

    def merge(
        self, current: UserPreferencesOut, patch: dict[str, object | None]
    ) -> UserPreferencesOut:
        self._reject_unknown_keys(patch)
        theme = current.theme
        locale = current.locale
        if "theme" in patch:
            theme = self._optional_theme(patch["theme"])
        if "locale" in patch:
            locale = self._optional_locale(patch["locale"])
        return UserPreferencesOut(theme=theme, locale=locale)

    @staticmethod
    def _parse_object(raw: str | None) -> dict[str, object]:
        if raw is None or raw.strip() == "":
            return {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if not isinstance(data, dict):
            return {}
        return data

    @staticmethod
    def _reject_unknown_keys(patch: dict[str, object | None]) -> None:
        unknown = sorted(set(patch) - KNOWN_PREFERENCE_KEYS)
        if unknown:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Unknown preference keys: {', '.join(unknown)}",
            )

    @staticmethod
    def _optional_theme(value: object | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or value not in ALLOWED_THEMES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "theme must be 'light' or 'dark'",
            )
        return value

    @staticmethod
    def _optional_locale(value: object | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or value not in ALLOWED_LOCALES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "locale must be a known locale code",
            )
        return value
