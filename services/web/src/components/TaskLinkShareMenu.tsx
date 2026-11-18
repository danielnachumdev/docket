import { useTranslation } from 'react-i18next'
import { useToast } from '../lib/toast'
import { Menu, type MenuItem } from './Menu'

export function taskLinkUrl(taskId: string): string {
  return `${window.location.origin}/tasks/${taskId}`
}

type Props = {
  taskId: string
  title: string
  number?: number
  className?: string
  /** When set, used as the trigger aria-label/title instead of the default. */
  label?: string
}

function canSystemShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export function TaskLinkShareMenu({ taskId, title, number, className, label }: Props) {
  const { t } = useTranslation('tasks')
  const toast = useToast()
  const displayTitle = title.trim() || (number != null ? `#${number}` : taskId)
  const triggerLabel = label ?? t('linkShare.button')

  async function copyLink() {
    const url = taskLinkUrl(taskId)
    try {
      await navigator.clipboard.writeText(url)
      toast(t('linkShare.copied'))
    } catch {
      toast({ message: t('linkShare.copyFailed'), tone: 'danger' })
    }
  }

  async function systemShare() {
    const url = taskLinkUrl(taskId)
    try {
      await navigator.share({
        title: displayTitle,
        text: displayTitle,
        url,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast({ message: t('linkShare.systemFailed'), tone: 'danger' })
    }
  }

  const items: MenuItem[] = [
    { label: t('linkShare.copy'), icon: 'copy', onSelect: () => void copyLink() },
    ...(canSystemShare()
      ? [{ label: t('linkShare.system'), icon: 'share' as const, onSelect: () => void systemShare() }]
      : []),
  ]

  return <Menu label={triggerLabel} icon="share" items={items} className={className} />
}
