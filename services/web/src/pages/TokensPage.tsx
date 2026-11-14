import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type ApiToken, type Role } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { ListRow } from '../components/ListRow'
import { PageHeader } from '../components/PageHeader'
import { SecretReveal } from '../components/SecretReveal'
import { SectionHeading } from '../components/SectionHeading'
import { useConfirm } from '../lib/dialogs'
import { formatDateTime, formatRelative } from '../lib/format'
import { useToast } from '../lib/toast'
import { useAction } from '../lib/useAction'

export function TokensPage() {
  const { t } = useTranslation(['integrations', 'common'])
  const confirm = useConfirm()
  const toast = useToast()
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
      toast(t('tokens.revokedToast', { name: token.name }))
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

      <form className="card create-form" onSubmit={onCreate}>
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

      <SectionHeading
        title={t('tokens.listTitle')}
        count={tokens?.length}
        action={
          <label className="switch">
            <input
              type="checkbox"
              checked={includeRevoked}
              onChange={(e) => setIncludeRevoked(e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
            {t('tokens.showRevoked')}
          </label>
        }
      />

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
              <ListRow
                key={token.id}
                icon="key"
                muted={revoked}
                title={token.name}
                meta={[
                  token.role_name
                    ? t('tokens.role', { name: token.role_name })
                    : t('tokens.fullPermissions'),
                  <span key="created" title={formatDateTime(token.created_at)}>
                    {t('created', { when: formatRelative(token.created_at) })}
                  </span>,
                  <span key="used" title={formatDateTime(token.last_used_at)}>
                    {token.last_used_at
                      ? t('tokens.lastUsed', { when: formatRelative(token.last_used_at) })
                      : t('tokens.neverUsed')}
                  </span>,
                ]}
                trailing={
                  revoked ? (
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
                  )
                }
              />
            )
          })}
        </ul>
      )}
    </main>
  )
}
