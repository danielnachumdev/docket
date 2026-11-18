import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  api,
  NOTIFICATION_KINDS,
  type Notification,
  type NotificationKind,
} from '../api'
import { Alert, EmptyState } from '../components/Feedback'
import { Skeleton } from '../components/Skeleton'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { UserBidiText } from '../components/UserBidiText'
import { formatDateTime, formatRelative, humanize } from '../lib/format'
import { useToast } from '../lib/toast'
import { useAction } from '../lib/useAction'
import { usePreferences } from '../preferences'
import './NotificationsPage.css'

function notifyChanged() {
  window.dispatchEvent(new Event('waymark:notifications'))
}

export function NotificationsPage() {
  const { t } = useTranslation('inbox')
  const toast = useToast()
  const {
    notificationKinds,
    setNotificationKinds,
    notificationSort,
    setNotificationSort,
    hydrated,
  } = usePreferences()
  const [rows, setRows] = useState<Notification[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    if (notificationKinds.length === 0) {
      setRows([])
      return
    }
    setRows(
      await api.listNotifications({
        limit: 100,
        kinds: notificationKinds,
        sort: notificationSort,
      }),
    )
  }, [notificationKinds, notificationSort])

  useEffect(() => {
    if (!hydrated) return
    setRows(null)
    load().catch((err: Error) => setLoadError(err.message))
  }, [hydrated, load])

  const unread = rows?.filter((n) => !n.read_at).length ?? 0
  const selected = new Set(notificationKinds)

  function toggleKind(kind: NotificationKind) {
    if (selected.has(kind)) {
      setNotificationKinds(notificationKinds.filter((k) => k !== kind))
      return
    }
    setNotificationKinds([...notificationKinds, kind])
  }

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
                  await api.markAllNotificationsRead({ kinds: notificationKinds })
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

      <div className="toolbar notification-toolbar">
        <label className="toolbar-sort">
          <span className="sr-only">{t('sortLabel')}</span>
          <select
            className="compact-select"
            value={notificationSort}
            aria-label={t('sortLabel')}
            onChange={(e) =>
              setNotificationSort(e.target.value === 'oldest' ? 'oldest' : 'newest')
            }
          >
            <option value="newest">{t('sort.newest')}</option>
            <option value="oldest">{t('sort.oldest')}</option>
          </select>
        </label>
        <div className="chips" role="group" aria-label={t('filterByKind')}>
          {NOTIFICATION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={selected.has(kind)}
              className={selected.has(kind) ? 'chip active' : 'chip'}
              onClick={() => toggleKind(kind)}
            >
              {t(`kind.${kind}`, { defaultValue: humanize(kind) })}
            </button>
          ))}
        </div>
      </div>

      {loadError && <Alert>{loadError}</Alert>}
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {!hydrated || rows == null ? (
        !loadError && <Skeleton rows={5} leading="none" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="bell"
          title={notificationKinds.length === 0 ? t('emptyFilteredTitle') : t('emptyTitle')}
          action={
            <Link to="/" className="btn">
              <Icon name="tasks" />
              {t('browseTasks')}
            </Link>
          }
        >
          {notificationKinds.length === 0 ? t('emptyFilteredHint') : t('emptyHint')}
        </EmptyState>
      ) : (
        <ul className="notification-list">
          {rows.map((n) => {
            const unreadItem = !n.read_at
            const inner = (
              <>
                {unreadItem && <span className="unread-dot" aria-hidden="true" />}
                <span className={n.kind === 'mentioned' ? 'tag caps accent' : 'tag caps'}>
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
                <span className="notif-time muted small nowrap" title={formatDateTime(n.created_at)}>
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
