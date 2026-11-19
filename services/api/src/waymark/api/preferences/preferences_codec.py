import json

from fastapi import HTTPException, status

from waymark.schemas.notifications import ALLOWED_NOTIFICATION_KINDS
from waymark.schemas.preferences import (
    ALLOWED_COLOR_SCHEMES,
    ALLOWED_DATE_FORMATS,
    ALLOWED_LOCALES,
    ALLOWED_NOTIFICATION_SORTS,
    ALLOWED_TASK_SORT_MODES,
    ALLOWED_THEME_TOKEN_KEYS,
    ALLOWED_TIME_FORMATS,
    CUSTOM_THEME_ID_RE,
    CustomThemeOut,
    KNOWN_PREFERENCE_KEYS,
    UserPreferencesOut,
    _MAX_CUSTOM_THEMES,
    _MAX_THEME_NAME_LEN,
    canonicalize_theme_id,
    is_builtin_theme_id,
    is_custom_theme_id,
    validate_theme_token_value,
)


class PreferencesCodec:
    """Encode/decode allowlisted preference maps stored as JSON text."""

    def decode(self, raw: str | None) -> UserPreferencesOut:
        data = self._parse_object(raw)
        customs: list[CustomThemeOut] | None
        if "custom_themes" in data:
            try:
                customs = self._optional_custom_themes(data.get("custom_themes"))
            except HTTPException:
                customs = None
        else:
            customs = None
        theme_raw = data.get("theme")
        try:
            theme = self._optional_theme(theme_raw, customs)
        except HTTPException:
            theme = None
        locale: str | None
        try:
            locale = self._optional_locale(data.get("locale"))
        except HTTPException:
            locale = None
        task_sort_mode: str | None
        try:
            task_sort_mode = self._optional_task_sort_mode(data.get("task_sort_mode"))
        except HTTPException:
            task_sort_mode = None
        notification_kinds: list[str] | None
        try:
            notification_kinds = self._optional_notification_kinds(
                data.get("notification_kinds")
            )
        except HTTPException:
            notification_kinds = None
        notification_sort: str | None
        try:
            notification_sort = self._optional_notification_sort(
                data.get("notification_sort")
            )
        except HTTPException:
            notification_sort = None
        date_format: str | None
        try:
            date_format = self._optional_date_format(data.get("date_format"))
        except HTTPException:
            date_format = None
        time_format: str | None
        try:
            time_format = self._optional_time_format(data.get("time_format"))
        except HTTPException:
            time_format = None
        return UserPreferencesOut(
            theme=theme,
            locale=locale,
            custom_themes=customs,
            task_sort_mode=task_sort_mode,
            notification_kinds=notification_kinds,
            notification_sort=notification_sort,
            date_format=date_format,
            time_format=time_format,
        )

    def encode(self, prefs: UserPreferencesOut) -> str:
        payload: dict[str, object] = {}
        if prefs.theme is not None:
            payload["theme"] = prefs.theme
        if prefs.locale is not None:
            payload["locale"] = prefs.locale
        if prefs.custom_themes is not None:
            payload["custom_themes"] = [
                theme.model_dump(mode="json") for theme in prefs.custom_themes
            ]
        if prefs.task_sort_mode is not None:
            payload["task_sort_mode"] = prefs.task_sort_mode
        if prefs.notification_kinds is not None:
            payload["notification_kinds"] = list(prefs.notification_kinds)
        if prefs.notification_sort is not None:
            payload["notification_sort"] = prefs.notification_sort
        if prefs.date_format is not None:
            payload["date_format"] = prefs.date_format
        if prefs.time_format is not None:
            payload["time_format"] = prefs.time_format
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)

    def merge(
        self, current: UserPreferencesOut, patch: dict[str, object | None]
    ) -> UserPreferencesOut:
        self._reject_unknown_keys(patch)
        theme = current.theme
        locale = current.locale
        custom_themes = current.custom_themes
        task_sort_mode = current.task_sort_mode
        notification_kinds = current.notification_kinds
        notification_sort = current.notification_sort
        date_format = current.date_format
        time_format = current.time_format
        if "custom_themes" in patch:
            custom_themes = self._optional_custom_themes(patch["custom_themes"])
        if "theme" in patch:
            theme = self._optional_theme(patch["theme"], custom_themes)
        if "locale" in patch:
            locale = self._optional_locale(patch["locale"])
        if "task_sort_mode" in patch:
            task_sort_mode = self._optional_task_sort_mode(patch["task_sort_mode"])
        if "notification_kinds" in patch:
            notification_kinds = self._optional_notification_kinds(
                patch["notification_kinds"]
            )
        if "notification_sort" in patch:
            notification_sort = self._optional_notification_sort(
                patch["notification_sort"]
            )
        if "date_format" in patch:
            date_format = self._optional_date_format(patch["date_format"])
        if "time_format" in patch:
            time_format = self._optional_time_format(patch["time_format"])
        # Active theme must remain resolvable after catalog changes.
        if theme is not None and not is_builtin_theme_id(theme):
            ids = {t.id for t in (custom_themes or [])}
            if theme not in ids:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "theme references an unknown custom theme",
                )
        return UserPreferencesOut(
            theme=theme,
            locale=locale,
            custom_themes=custom_themes,
            task_sort_mode=task_sort_mode,
            notification_kinds=notification_kinds,
            notification_sort=notification_sort,
            date_format=date_format,
            time_format=time_format,
        )

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
    def _optional_theme(
        value: object | None, customs: list[CustomThemeOut] | None
    ) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "theme must be a string",
            )
        theme_id = canonicalize_theme_id(value)
        if is_builtin_theme_id(theme_id):
            return theme_id
        if not is_custom_theme_id(theme_id):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "theme must be a builtin id or a custom theme id",
            )
        ids = {t.id for t in (customs or [])}
        if theme_id not in ids:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "theme references an unknown custom theme",
            )
        return theme_id

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

    @staticmethod
    def _optional_task_sort_mode(value: object | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or value not in ALLOWED_TASK_SORT_MODES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "task_sort_mode must be 'custom' or 'date'",
            )
        return value

    @staticmethod
    def _optional_notification_sort(value: object | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or value not in ALLOWED_NOTIFICATION_SORTS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "notification_sort must be 'newest' or 'oldest'",
            )
        return value

    @staticmethod
    def _optional_date_format(value: object | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or value not in ALLOWED_DATE_FORMATS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "date_format must be 'DD/MM/YYYY', 'MM/DD/YYYY', or 'YYYY-MM-DD'",
            )
        return value

    @staticmethod
    def _optional_time_format(value: object | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or value not in ALLOWED_TIME_FORMATS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "time_format must be '24h' or '12h'",
            )
        return value

    @staticmethod
    def _optional_notification_kinds(value: object | None) -> list[str] | None:
        if value is None:
            return None
        if not isinstance(value, list):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "notification_kinds must be a list",
            )
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str) or item not in ALLOWED_NOTIFICATION_KINDS:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "notification_kinds contains an unknown kind",
                )
            if item in seen:
                continue
            seen.add(item)
            cleaned.append(item)
        return cleaned

    @classmethod
    def _optional_custom_themes(
        cls, value: object | None
    ) -> list[CustomThemeOut] | None:
        if value is None:
            return None
        if not isinstance(value, list):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "custom_themes must be a list",
            )
        if len(value) > _MAX_CUSTOM_THEMES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes supports at most {_MAX_CUSTOM_THEMES} themes",
            )
        seen: set[str] = set()
        out: list[CustomThemeOut] = []
        for index, item in enumerate(value):
            theme = cls._parse_custom_theme(item, index)
            if theme.id in seen:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"duplicate custom theme id: {theme.id}",
                )
            seen.add(theme.id)
            out.append(theme)
        return out

    @classmethod
    def _parse_custom_theme(cls, value: object, index: int) -> CustomThemeOut:
        if not isinstance(value, dict):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes[{index}] must be an object",
            )
        raw_id = value.get("id")
        raw_name = value.get("name")
        raw_base = value.get("base")
        raw_tokens = value.get("tokens")
        if not isinstance(raw_id, str) or not CUSTOM_THEME_ID_RE.match(raw_id):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes[{index}].id is invalid",
            )
        if not isinstance(raw_name, str):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes[{index}].name must be a string",
            )
        name = " ".join(raw_name.split()).strip()
        if not name or len(name) > _MAX_THEME_NAME_LEN:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes[{index}].name must be 1–{_MAX_THEME_NAME_LEN} characters",
            )
        if not isinstance(raw_base, str) or raw_base not in ALLOWED_COLOR_SCHEMES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes[{index}].base must be 'light' or 'dark'",
            )
        if not isinstance(raw_tokens, dict):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes[{index}].tokens must be an object",
            )
        missing = ALLOWED_THEME_TOKEN_KEYS - set(raw_tokens)
        if missing:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes[{index}].tokens missing keys: {', '.join(sorted(missing))}",
            )
        unknown = set(raw_tokens) - ALLOWED_THEME_TOKEN_KEYS
        if unknown:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"custom_themes[{index}].tokens unknown keys: {', '.join(sorted(unknown))}",
            )
        cleaned: dict[str, str] = {}
        for key in sorted(ALLOWED_THEME_TOKEN_KEYS):
            raw_val = raw_tokens[key]
            if not isinstance(raw_val, str):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"custom_themes[{index}].tokens.{key} must be a string",
                )
            try:
                cleaned[key] = validate_theme_token_value(key, raw_val)
            except ValueError as exc:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"custom_themes[{index}].tokens.{key}: {exc}",
                ) from exc
        return CustomThemeOut(id=raw_id, name=name, base=raw_base, tokens=cleaned)
