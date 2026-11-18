import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MentionableUser } from '../../api'
import { Dialog } from '../../components/Dialog'
import { contactPickerLabel } from '../../lib/contactLabel'
import { UserBidiText } from '../../components/UserBidiText'

export type ShareRole = 'viewer' | 'commentor' | 'editor'
export type MentionShareChoice = ShareRole | 'skip'

type Props = {
  users: MentionableUser[]
  busy?: boolean
  onCancel: () => void
  onConfirm: (choices: Record<number, MentionShareChoice>) => void
}

export function MentionShareDialog({ users, busy = false, onCancel, onConfirm }: Props) {
  const { t } = useTranslation(['detail', 'tasks', 'common'])
  const [choices, setChoices] = useState<Record<number, MentionShareChoice | ''>>(() =>
    Object.fromEntries(users.map((u) => [u.user_id, '' as const])),
  )

  const allChosen = useMemo(
    () => users.every((u) => Boolean(choices[u.user_id])),
    [choices, users],
  )

  return (
    <Dialog
      title={t('sharing.mentionShareTitle')}
      description={t('sharing.mentionShareDescription')}
      onClose={onCancel}
      size="md"
      footer={
        <>
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            {t('common:cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !allChosen}
            data-autofocus
            onClick={() => {
              const next: Record<number, MentionShareChoice> = {}
              for (const u of users) {
                const choice = choices[u.user_id]
                if (choice) next[u.user_id] = choice
              }
              onConfirm(next)
            }}
          >
            {t('sharing.mentionShareContinue')}
          </button>
        </>
      }
    >
      <ul className="stack tight" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {users.map((u) => (
          <li key={u.user_id} className="stack tight">
            <UserBidiText text={contactPickerLabel(u)} />
            <p className="muted small" style={{ margin: 0 }}>
              {t('sharing.mentionShareNoAccess', { name: u.nickname || u.display_name })}
            </p>
            <select
              value={choices[u.user_id] ?? ''}
              disabled={busy}
              aria-label={t('sharing.roleLabel')}
              onChange={(e) =>
                setChoices((prev) => ({
                  ...prev,
                  [u.user_id]: e.target.value as MentionShareChoice | '',
                }))
              }
            >
              <option value="" disabled>
                {t('sharing.rolePlaceholder')}
              </option>
              <option value="skip">{t('sharing.mentionShareSkip')}</option>
              <option value="viewer">{t('tasks:shareRoleViewer')}</option>
              <option value="commentor">{t('tasks:shareRoleCommentor')}</option>
              <option value="editor">{t('tasks:shareRoleEditor')}</option>
            </select>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
