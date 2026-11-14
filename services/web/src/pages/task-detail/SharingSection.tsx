import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type TaskShare } from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { initials } from '../../lib/format'
import { useAction } from '../../lib/useAction'

type Props = {
  taskId: string
  shares: TaskShare[]
  isOwner: boolean
  onChanged: () => Promise<void>
}

export function SharingSection({ taskId, shares, isOwner, onChanged }: Props) {
  const { t } = useTranslation(['detail', 'tasks'])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'commentor' | 'editor'>('viewer')
  const { busy, error, setError, run } = useAction()

  function roleLabel(role: string) {
    if (role === 'editor') return t('tasks:shareRoleEditor')
    if (role === 'commentor') return t('tasks:shareRoleCommentor')
    return t('tasks:shareRoleViewer')
  }

  function onShare(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    void run(async () => {
      await api.shareTask(taskId, { email: email.trim().toLowerCase(), role })
      setEmail('')
      await onChanged()
    }, t('sharing.shareFailed'))
  }

  return (
    <Section icon="users" title={t('sharing.title')} count={shares.length}>
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
              {isOwner && (
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
      {isOwner && (
        <form className="stack tight" onSubmit={onShare}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('sharing.emailPlaceholder')}
            aria-label={t('sharing.emailLabel')}
            required
          />
          <div className="inline-form">
            <select
              className="grow"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as 'viewer' | 'commentor' | 'editor')
              }
              aria-label={t('sharing.roleLabel')}
            >
              <option value="viewer">{t('tasks:shareRoleViewer')}</option>
              <option value="commentor">{t('tasks:shareRoleCommentor')}</option>
              <option value="editor">{t('tasks:shareRoleEditor')}</option>
            </select>
            <button type="submit" className="btn" disabled={busy || !email.trim()}>
              <Icon name="users" />
              {t('sharing.share')}
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}
