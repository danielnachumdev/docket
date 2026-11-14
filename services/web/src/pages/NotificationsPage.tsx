import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type Notification } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { UserBidiText } from '../components/UserBidiText'
import { formatDateTime, formatRelative, humanize } from '../lib/format'
import { useToast } from '../lib/toast'
import { useAction } from '../lib/useAction'

function notifyChanged() {
  window.dispatchEvent(new Event('waymark:notifications'))
}

export function NotificationsPage() {
  const { t } = useTranslation('inbox')
  const toast = useToast()
  const [rows, setRows] = useState<Notification[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    setRows(await api.listNotifications({ limit: 100 }))
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setLoadError(err.message))
  }, [load])

  const unread = rows?.filter((n) => !n.read_at).length ?? 0

  function markRead(n: Notification) {
    if (n.read_at) return
    const now = new Date().toISOString()
    setRows((prev) => prev?.map((row) => (row.id === n.id ? { ...row, read_at: now } : row)) ?? prev)
    void api.markNotificationRead(n.id).then(notifyChanged)
  }

  return (
    <main className="page narrow">
      <PageHeader
        title={t('title')}
        subtitle={
          rows == null ? null : unread === 0 ? t('caughtUp') : t('unreadCount', { count: unread })
        }
        actions={
          unread > 0 && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.markAllNotificationsRead()
                  await load()
                  notifyChanged()
                  toast(t('markedAllRead'))
                }, t('markAllFailed'))
              }
            >
              <Icon name="check" />
              {t('markAllRead')}
            </button>
          )
        }
      />

      {loadError && <Alert>{loadError}</Alert>}
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {rows == null ? (
        !loadError && <Skeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="bell"
          title={t('emptyTitle')}
          action={
            <Link to="/" className="btn">
              <Icon name="tasks" />
              {t('browseTasks')}
            </Link>
          }
        >
          {t('emptyHint')}
        </EmptyState>
      ) : (
        <ul className="notification-list">
          {rows.map((n) => {
            const unreadItem = !n.read_at
            const inner = (
              <>
                {unreadItem && <span className="unread-dot" aria-hidden="true" />}
                <span className={`notif-kind kind-${n.kind}`}>
                  {t(`kind.${n.kind}`, { defaultValue: humanize(n.kind) })}
                </span>
                <span className="grow min-0">
                  <UserBidiText
                    text={n.title}
                    className={unreadItem ? 'block notif-title unread' : 'block notif-title'}
                  />
                  {n.body && (
                    <UserBidiText text={n.body} className="muted small block clamp-2" />
                  )}
                </span>
                <span className="muted small nowrap" title={formatDateTime(n.created_at)}>
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
                    onClick={() => markRead(n)}
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
