WEBHOOK_EVENT_TYPES = frozenset(
    {
        "status_changed",
        "claimed",
        "released",
        "commented",
        "shared",
        "unshared",
    }
)

DEFAULT_WEBHOOK_EVENT_TYPES = sorted(WEBHOOK_EVENT_TYPES)
