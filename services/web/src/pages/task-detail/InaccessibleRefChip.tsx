import { useTranslation } from 'react-i18next'
import './CommentRefChip.css'

type Props = {
  className?: string
}

/** Slack-style chip for refs the current viewer cannot open. */
export function InaccessibleRefChip({ className }: Props) {
  const { t } = useTranslation('tasks')
  const label = t('refPreview.private')
  return (
    <span
      className={['comment-chip', 'is-private', className].filter(Boolean).join(' ')}
      title={label}
      aria-label={label}
    >
      {label}
    </span>
  )
}
