import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type RegistrationInvite } from '../api'
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

type Props = {
  canMint?: boolean
}

export function InvitesPage({ canMint = false }: Props) {
  const { t } = useTranslation(['integrations', 'common'])
  const confirm = useConfirm()
  const toast = useToast()
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
      toast(t('invites.revokedToast'))
    }, t('invites.revokeFailed'))
  }

  return (
    <main className="page narrow">
      <PageHeader title={t('invites.title')} subtitle={t('invites.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {!canMint && <Alert tone="info">{t('invites.ownerOnlyHint')}</Alert>}
      {createdPath && (
        <SecretReveal
          icon="userPlus"
          title={t('invites.revealTitle')}
          secret={`${window.location.origin}${createdPath}`}
          onDismiss={() => setCreatedPath(null)}
        >
          {t('invites.revealHint')}
        </SecretReveal>
      )}

      <form className="card create-form" onSubmit={onCreate}>
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

      <SectionHeading title={t('invites.historyTitle')} count={invites?.length} />

      {invites == null ? (
        <Skeleton rows={3} />
      ) : invites.length === 0 ? (
        <EmptyState icon="userPlus" title={t('invites.emptyTitle')}>
          {canMint ? t('invites.emptyHint') : t('invites.ownerOnlyHint')}
        </EmptyState>
      ) : (
        <ul className="card list">
          {invites.map((invite) => {
            const consumed = invite.consumed_at != null
            const expired = !consumed && new Date(invite.expires_at).getTime() <= Date.now()
            return (
              <ListRow
                key={invite.id}
                icon="userPlus"
                muted={consumed || expired}
                title={invite.email ?? t('invites.openInvite')}
                meta={[
                  <span key="created" title={formatDateTime(invite.created_at)}>
                    {t('created', { when: formatRelative(invite.created_at) })}
                  </span>,
                  <span key="expires" title={formatDateTime(invite.expires_at)}>
                    {t('invites.expires', { when: formatRelative(invite.expires_at) })}
                  </span>,
                  consumed && (
                    <span key="used" title={formatDateTime(invite.consumed_at)}>
                      {t('invites.used', { when: formatRelative(invite.consumed_at) })}
                    </span>
                  ),
                ]}
                trailing={
                  consumed ? (
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
                  ) : null
                }
              />
            )
          })}
        </ul>
      )}
    </main>
  )
}
