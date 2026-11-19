import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type ExternalShare, type ExternalShareCreated } from '../api'
import { useConfirm } from '../lib/dialogs'
import { formatDateTime } from '../lib/format'
import { useToast } from '../lib/toast'
import { useAction } from '../lib/useAction'
import { Alert } from './Feedback'
import { Dialog } from './Dialog'
import { Skeleton } from './Skeleton'
import './ExternalShareLinksDialog.css'

export function externalShareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`
}

type Props = {
  taskId: string
  onClose: () => void
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function ExternalShareLinksDialog({ taskId, onClose }: Props) {
  const { t } = useTranslation(['tasks', 'common'])
  const toast = useToast()
  const confirm = useConfirm()
  const { busy, error, setError, run } = useAction()
  const [rows, setRows] = useState<ExternalShare[] | null>(null)
  const [name, setName] = useState('')
  const [expires, setExpires] = useState('')
  const [revealed, setRevealed] = useState<ExternalShareCreated | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editExpires, setEditExpires] = useState('')

  async function reload() {
    const list = await api.listExternalShares(taskId)
    setRows(list)
  }

  useEffect(() => {
    void run(async () => {
      await reload()
    }, t('tasks:linkShare.externalLoadFailed'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open
  }, [taskId])

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(externalShareUrl(token))
      toast(t('tasks:linkShare.externalCopied'))
    } catch {
      toast({ message: t('tasks:linkShare.copyFailed'), tone: 'danger' })
    }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    void run(async () => {
      const created = await api.createExternalShare(taskId, {
        name: trimmed,
        expires_at: fromLocalInput(expires),
      })
      setName('')
      setExpires('')
      setRevealed(created)
      await reload()
    }, t('tasks:linkShare.externalCreateFailed'))
  }

  function startEdit(row: ExternalShare) {
    setEditingId(row.id)
    setEditName(row.name)
    setEditExpires(toLocalInput(row.expires_at))
  }

  function onSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (editingId == null) return
    const trimmed = editName.trim()
    if (!trimmed) return
    const expiresAt = fromLocalInput(editExpires)
    void run(async () => {
      await api.updateExternalShare(taskId, editingId, {
        name: trimmed,
        ...(expiresAt ? { expires_at: expiresAt } : { clear_expires_at: true }),
      })
      setEditingId(null)
      await reload()
    }, t('tasks:linkShare.externalUpdateFailed'))
  }

  async function onRevoke(row: ExternalShare) {
    const ok = await confirm({
      title: t('tasks:linkShare.externalRevokeConfirmTitle'),
      description: t('tasks:linkShare.externalRevokeConfirmBody', { name: row.name }),
      confirmLabel: t('tasks:linkShare.externalRevoke'),
      danger: true,
    })
    if (!ok) return
    void run(async () => {
      await api.revokeExternalShare(taskId, row.id)
      if (revealed?.id === row.id) setRevealed(null)
      await reload()
    }, t('tasks:linkShare.externalRevokeFailed'))
  }

  async function onRotate(row: ExternalShare) {
    const ok = await confirm({
      title: t('tasks:linkShare.externalRotateConfirmTitle'),
      description: t('tasks:linkShare.externalRotateConfirmBody', { name: row.name }),
      confirmLabel: t('tasks:linkShare.externalRotate'),
      danger: true,
    })
    if (!ok) return
    void run(async () => {
      const rotated = await api.rotateExternalShare(taskId, row.id)
      setRevealed(rotated)
      await reload()
    }, t('tasks:linkShare.externalRotateFailed'))
  }

  return (
    <Dialog
      title={t('tasks:linkShare.externalTitle')}
      description={t('tasks:linkShare.externalDescription')}
      onClose={onClose}
      size="md"
    >
      <div className="stack external-share-dialog">
        {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

        {revealed && (
          <div className="external-share-reveal">
            <p className="small">{t('tasks:linkShare.externalTokenOnce')}</p>
            <code className="external-share-url">{externalShareUrl(revealed.token)}</code>
            <button
              type="button"
              className="btn primary small"
              onClick={() => void copyToken(revealed.token)}
            >
              {t('tasks:linkShare.externalCopy')}
            </button>
          </div>
        )}

        <form className="external-share-create" onSubmit={onCreate}>
          <label className="field">
            <span>{t('tasks:linkShare.externalName')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('tasks:linkShare.externalNamePlaceholder')}
              maxLength={120}
              required
              data-autofocus
            />
          </label>
          <label className="field">
            <span>{t('tasks:linkShare.externalExpires')}</span>
            <input
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {t('tasks:linkShare.externalCreate')}
          </button>
        </form>

        {rows == null ? (
          <Skeleton rows={3} />
        ) : rows.length === 0 ? (
          <p className="muted small">{t('tasks:linkShare.externalEmpty')}</p>
        ) : (
          <ul className="external-share-list">
            {rows.map((row) => {
              const revoked = row.revoked_at != null
              const editing = editingId === row.id
              return (
                <li key={row.id} className={revoked ? 'revoked' : undefined}>
                  {editing ? (
                    <form className="external-share-edit" onSubmit={onSaveEdit}>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={120}
                        required
                      />
                      <input
                        type="datetime-local"
                        value={editExpires}
                        onChange={(e) => setEditExpires(e.target.value)}
                      />
                      <div className="row-actions">
                        <button type="submit" className="btn small primary" disabled={busy}>
                          {t('tasks:linkShare.externalSave')}
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          onClick={() => setEditingId(null)}
                        >
                          {t('common:cancel')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="external-share-row-main">
                        <strong>{row.name}</strong>
                        <span className={`tag ${revoked ? 'danger' : ''}`}>
                          {revoked
                            ? t('tasks:linkShare.externalRevoked')
                            : t('tasks:linkShare.externalActive')}
                        </span>
                      </div>
                      <p className="muted small">
                        {row.expires_at
                          ? formatDateTime(row.expires_at)
                          : t('tasks:linkShare.externalNever')}
                        {' · '}
                        {formatDateTime(row.created_at)}
                      </p>
                      {!revoked && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={busy}
                            onClick={() => startEdit(row)}
                          >
                            {t('tasks:linkShare.externalEdit')}
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={busy}
                            onClick={() => void onRotate(row)}
                          >
                            {t('tasks:linkShare.externalRotate')}
                          </button>
                          <button
                            type="button"
                            className="btn ghost small danger"
                            disabled={busy}
                            onClick={() => void onRevoke(row)}
                          >
                            {t('tasks:linkShare.externalRevoke')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
