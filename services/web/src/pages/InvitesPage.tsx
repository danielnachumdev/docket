import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type RegistrationInvite } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { SecretReveal } from '../components/SecretReveal'
import { useConfirm } from '../lib/dialogs'
import { formatDateTime, formatRelative } from '../lib/format'
import { useAction } from '../lib/useAction'

type Props = {
  canMint?: boolean
}

export function InvitesPage({ canMint = false }: Props) {
  const { t } = useTranslation(['integrations', 'common'])
  const confirm = useConfirm()
  const [invites, setInvites] = useState<RegistrationInvite[] | null>(null)
  const [email, setEmail] = useState('')
  const [createdPath, setCreatedPath] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    if (!canMint) {
      setInvites([])
      return
    }
    setInvites(await api.listInvites())
  }, [canMint])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [load, setError])

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!canMint) return
    setCreatedPath(null)
    void run(async () => {
      const created = await api.createInvite({
        email: email.trim() ? email.trim() : null,
      })
      setEmail('')
      setCreatedPath(created.register_path)
      await load()
    }, t('invites.createFailed'))
  }

  async function onRevoke(invite: RegistrationInvite) {
    if (!canMint) return
    const ok = await confirm({
      title: t('invites.revokeTitle'),
      description: t('invites.revokeBody'),
      confirmLabel: t('common:revoke'),
      danger: true,
    })
    if (!ok) return
    void run(async () => {
      await api.revokeInvite(invite.id)
      await load()
    }, t('invites.revokeFailed'))
  }

  return (
    <main className="page narrow">
      <PageHeader title={t('invites.title')} subtitle={t('invites.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {!canMint && <Alert>{t('invites.ownerOnlyHint')}</Alert>}
      {createdPath && (
        <SecretReveal
          icon="users"
          title={t('invites.revealTitle')}
          secret={`${window.location.origin}${createdPath}`}
          onDismiss={() => setCreatedPath(null)}
        >
          {t('invites.revealHint')}
        </SecretReveal>
      )}

      <form className="card token-form" onSubmit={onCreate}>
        <label className="field grow">
          <span>{t('invites.email')}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('invites.emailPlaceholder')}
            maxLength={320}
            disabled={!canMint || busy}
          />
        </label>
        <button
          type="submit"
          className="btn primary"
          disabled={!canMint || busy}
          title={!canMint ? t('invites.mintDisabled') : undefined}
        >
          <Icon name="plus" />
          {t('invites.create')}
        </button>
      </form>

      <div className="section-head">
        <h2>{t('invites.historyTitle')}</h2>
      </div>

      {invites == null ? (
        <Skeleton rows={3} />
      ) : invites.length === 0 ? (
        <EmptyState icon="users" title={t('invites.emptyTitle')}>
          {canMint ? t('invites.emptyHint') : t('invites.ownerOnlyHint')}
        </EmptyState>
      ) : (
        <ul className="card list">
          {invites.map((invite) => {
            const consumed = invite.consumed_at != null
            const expired = !consumed && new Date(invite.expires_at).getTime() <= Date.now()
            return (
              <li key={invite.id} className={consumed || expired ? 'list-row revoked' : 'list-row'}>
                <span className="artifact-icon">
                  <Icon name="users" />
                </span>
                <span className="grow min-0">
                  <strong className="block truncate">
                    {invite.email ?? t('invites.openInvite')}
                  </strong>
                  <span className="muted small meta-line">
                    <span title={formatDateTime(invite.created_at)}>
                      {t('created', { when: formatRelative(invite.created_at) })}
                    </span>
                    <span title={formatDateTime(invite.expires_at)}>
                      {t('invites.expires', { when: formatRelative(invite.expires_at) })}
                    </span>
                    {consumed && (
                      <span title={formatDateTime(invite.consumed_at)}>
                        {t('invites.used', { when: formatRelative(invite.consumed_at) })}
                      </span>
                    )}
                  </span>
                </span>
                {consumed ? (
                  <span className="tag">{t('invites.usedTag')}</span>
                ) : expired ? (
                  <span className="tag">{t('invites.expiredTag')}</span>
                ) : canMint ? (
                  <button
                    type="button"
                    className="btn ghost small danger"
                    disabled={busy}
                    onClick={() => void onRevoke(invite)}
                  >
                    {t('common:revoke')}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
