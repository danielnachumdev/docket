import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Contact, type TaskShare } from '../../api'
import { Alert } from '../../components/Feedback'
import { CollaboratorPicker } from '../../components/CollaboratorPicker'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { initials } from '../../lib/format'
import { useAction } from '../../lib/useAction'

type ShareRole = 'viewer' | 'commentor' | 'editor'

type Props = {
  taskId: string
  shares: TaskShare[]
  /** Owner or editor (tasks:write on this task). Commentors cannot manage shares. */
  canManageShares: boolean
  onChanged: () => Promise<void>
  variant?: 'card' | 'plain'
  /** Render as a disclosure; collapsed on first render when true. */
  defaultCollapsed?: boolean
}

export function SharingSection({
  taskId,
  shares,
  canManageShares,
  onChanged,
  variant = 'card',
  defaultCollapsed,
}: Props) {
  const { t } = useTranslation(['detail', 'tasks'])
  const [person, setPerson] = useState<Contact | null>(null)
  const [role, setRole] = useState<ShareRole | ''>('')
  const { busy, error, setError, run } = useAction()

  const sharedIds = useMemo(() => new Set(shares.map((s) => s.user_id)), [shares])

  function roleLabel(roleName: string) {
    if (roleName === 'editor') return t('tasks:shareRoleEditor')
    if (roleName === 'commentor') return t('tasks:shareRoleCommentor')
    return t('tasks:shareRoleViewer')
  }

  function onShare(e: FormEvent) {
    e.preventDefault()
    if (!person || !role) return
    void run(async () => {
      await api.shareTask(taskId, { user_id: person.id, role })
      setPerson(null)
      setRole('')
      await onChanged()
    }, t('sharing.shareFailed'))
  }

  return (
    <Section
      icon="users"
      title={t('sharing.title')}
      count={shares.length}
      variant={variant}
      collapsible={defaultCollapsed != null}
      defaultCollapsed={defaultCollapsed}
    >
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {shares.length === 0 ? (
        <p className="muted small">{t('sharing.onlyYou')}</p>
      ) : (
        <ul className="list">
          {shares.map((s) => (
            <li key={s.id} id={`share-user-${s.user_id}`} className="list-row">
              <span className="avatar small">{initials(s.display_name)}</span>
              <span className="grow min-0">
                <span className="block truncate">{s.display_name}</span>
                {s.email && <span className="muted small block truncate">{s.email}</span>}
              </span>
              <span className={`role-tag role-${s.role}`}>{roleLabel(s.role)}</span>
              {canManageShares && (
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  aria-label={t('sharing.stopNamed', { name: s.display_name })}
                  title={t('sharing.stop')}
                  onClick={() =>
                    void run(async () => {
                      await api.unshareTask(taskId, s.id)
                      await onChanged()
                    }, t('sharing.unshareFailed'))
                  }
                >
                  <Icon name="x" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManageShares && (
        <form className="stack tight" onSubmit={onShare}>
          <CollaboratorPicker
            value={person}
            onChange={setPerson}
            excludeIds={sharedIds}
            disabled={busy}
          />
          <div className="inline-form">
            <select
              className="grow"
              value={role}
              onChange={(e) => setRole(e.target.value as ShareRole | '')}
              aria-label={t('sharing.roleLabel')}
              required
            >
              <option value="" disabled>
                {t('sharing.rolePlaceholder')}
              </option>
              <option value="viewer">{t('tasks:shareRoleViewer')}</option>
              <option value="commentor">{t('tasks:shareRoleCommentor')}</option>
              <option value="editor">{t('tasks:shareRoleEditor')}</option>
            </select>
            <button type="submit" className="btn" disabled={busy || !person || !role}>
              <Icon name="users" />
              {t('sharing.share')}
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}
