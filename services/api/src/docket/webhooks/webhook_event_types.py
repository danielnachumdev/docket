WEBHOOK_EVENT_TYPES = frozenset(
    {
        "status_changed",
        "claimed",
        "released",
        "commented",
    }
)

DEFAULT_WEBHOOK_EVENT_TYPES = sorted(WEBHOOK_EVENT_TYPES)
