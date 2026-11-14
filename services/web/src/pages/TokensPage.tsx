import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type ApiToken, type Role } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { SecretReveal } from '../components/SecretReveal'
import { useConfirm } from '../lib/dialogs'
import { formatDateTime, formatRelative } from '../lib/format'
import { useAction } from '../lib/useAction'

export function TokensPage() {
  const { t } = useTranslation(['integrations', 'common'])
  const confirm = useConfirm()
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState('')
  const [includeRevoked, setIncludeRevoked] = useState(false)
  const [createdRaw, setCreatedRaw] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    const [tokenRows, roleRows] = await Promise.all([
      api.listTokens(includeRevoked),
      api.listAssignableRoles(),
    ])
    setTokens(tokenRows)
    setRoles(roleRows)
  }, [includeRevoked])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [load, setError])

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreatedRaw(null)
    void run(async () => {
      const created = await api.createToken({
        name: name.trim(),
        role_id: roleId === '' ? null : Number(roleId),
      })
      setName('')
      setRoleId('')
      setCreatedRaw(created.token)
      await load()
    }, t('tokens.createFailed'))
  }

  async function onRevoke(token: ApiToken) {
    const ok = await confirm({
      title: t('tokens.revokeTitle'),
      description: t('tokens.revokeBody', { name: token.name }),
      confirmLabel: t('common:revoke'),
      danger: true,
    })
    if (!ok) return
    void run(async () => {
      await api.revokeToken(token.id)
      await load()
    }, t('tokens.revokeFailed'))
  }

  return (
    <main className="page narrow">
      <PageHeader title={t('tokens.title')} subtitle={t('tokens.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {createdRaw && (
        <SecretReveal
          icon="key"
          title={t('tokens.revealTitle')}
          secret={createdRaw}
          onDismiss={() => setCreatedRaw(null)}
        >
          {t('tokens.revealHint')}
        </SecretReveal>
      )}

      <form className="card token-form" onSubmit={onCreate}>
        <label className="field grow">
          <span>{t('tokens.name')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('tokens.namePlaceholder')}
            required
            maxLength={120}
          />
        </label>
        <label className="field">
          <span>{t('tokens.permissions')}</span>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">{t('tokens.fullOption')}</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
          <Icon name="plus" />
          {t('tokens.create')}
        </button>
      </form>

      <div className="section-head">
        <h2>{t('tokens.listTitle')}</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={includeRevoked}
            onChange={(e) => setIncludeRevoked(e.target.checked)}
          />
          <span className="switch-track" aria-hidden="true" />
          {t('tokens.showRevoked')}
        </label>
      </div>

      {tokens == null ? (
        <Skeleton rows={3} />
      ) : tokens.length === 0 ? (
        <EmptyState icon="key" title={t('tokens.emptyTitle')}>
          {t('tokens.emptyHint')}
        </EmptyState>
      ) : (
        <ul className="card list">
          {tokens.map((token) => {
            const revoked = token.revoked_at != null
            return (
              <li key={token.id} className={revoked ? 'list-row revoked' : 'list-row'}>
                <span className="artifact-icon">
                  <Icon name="key" />
                </span>
                <span className="grow min-0">
                  <strong className="block truncate">{token.name}</strong>
                  <span className="muted small meta-line">
                    <span>
                      {token.role_name
                        ? t('tokens.role', { name: token.role_name })
                        : t('tokens.fullPermissions')}
                    </span>
                    <span title={formatDateTime(token.created_at)}>
                      {t('created', { when: formatRelative(token.created_at) })}
                    </span>
                    <span title={formatDateTime(token.last_used_at)}>
                      {token.last_used_at
                        ? t('tokens.lastUsed', { when: formatRelative(token.last_used_at) })
                        : t('tokens.neverUsed')}
                    </span>
                  </span>
                </span>
                {revoked ? (
                  <span className="tag">{t('tokens.revoked')}</span>
                ) : (
                  <button
                    type="button"
                    className="btn ghost small danger"
                    disabled={busy}
                    onClick={() => void onRevoke(token)}
                  >
                    {t('common:revoke')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
