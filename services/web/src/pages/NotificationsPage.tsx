import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Notification } from '../api'
import { Alert, Skeleton } from '../components/Feedback'
import { formatDateTime, formatRelative, humanize } from '../lib/format'
import { useAction } from '../lib/useAction'

function kindLabel(kind: string) {
  switch (kind) {
    case 'status_changed':
      return 'Status'
    case 'commented':
      return 'Comment'
    case 'mentioned':
      return 'Mention'
    default:
      return humanize(kind)
  }
}

export function NotificationsPage() {
  const [rows, setRows] = useState<Notification[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    const data = await api.listNotifications({ limit: 100 })
    setRows(data)
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setLoadError(err.message))
  }, [load])

  if (loadError) {
    return (
      <main className="page">
        <Alert>{loadError}</Alert>
      </main>
    )
  }

  if (!rows) {
    return (
      <main className="page">
        <Skeleton rows={5} />
      </main>
    )
  }

  const unread = rows.filter((n) => !n.read_at).length

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="muted">
            {unread === 0 ? 'You are caught up.' : `${unread} unread`}
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.markAllNotificationsRead()
                await load()
                window.dispatchEvent(new Event('docket:notifications'))
              }, 'Could not mark all read')
            }
          >
            Mark all read
          </button>
        )}
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {rows.length === 0 ? (
        <p className="muted">No notifications yet. Watch a task to get updates.</p>
      ) : (
        <ul className="notification-list">
          {rows.map((n) => {
            const unreadItem = !n.read_at
            const inner = (
              <>
                <span className={`notif-kind kind-${n.kind}`}>{kindLabel(n.kind)}</span>
                <span className="grow min-0">
                  <span className="block">{n.title}</span>
                  {n.body && <span className="muted small block clamp-2">{n.body}</span>}
                </span>
                <span className="muted small" title={formatDateTime(n.created_at)}>
                  {formatRelative(n.created_at)}
                </span>
              </>
            )
            return (
              <li key={n.id} className={unreadItem ? 'notification-row unread' : 'notification-row'}>
                {n.task_id != null ? (
                  <Link
                    to={`/tasks/${n.task_id}`}
                    className="notification-link"
                    onClick={() => {
                      if (!unreadItem) return
                      void api.markNotificationRead(n.id).then(() => {
                        window.dispatchEvent(new Event('docket:notifications'))
                        setRows((prev) =>
                          prev
                            ? prev.map((row) =>
                                row.id === n.id
                                  ? { ...row, read_at: new Date().toISOString() }
                                  : row,
                              )
                            : prev,
                        )
                      })
                    }}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="notification-link">{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
