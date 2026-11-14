import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from './Icon'

type Props = {
  icon: IconName
  title: string
  secret: string
  children: ReactNode
  onDismiss: () => void
}

export function SecretReveal({ icon, title, secret, children, onDismiss }: Props) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    await navigator.clipboard.writeText(secret)
    setCopied(true)
  }

  return (
    <section className="card reveal" aria-live="polite">
      <header className="card-header">
        <h2>
          <Icon name={icon} />
          {title}
        </h2>
        <button type="button" className="icon-btn" aria-label={t('dismiss')} onClick={onDismiss}>
          <Icon name="x" />
        </button>
      </header>
      <p className="muted small">{children}</p>
      <div className="secret">
        <code>{secret}</code>
        <button type="button" className="btn small" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
    </section>
  )
}
