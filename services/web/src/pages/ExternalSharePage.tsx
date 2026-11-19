import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Logo } from '../components/AppLayout'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { TaskDetailPage } from './TaskDetailPage'
import './AuthPage.css'
import './ExternalSharePage.css'

/** Guest shell around the real task detail UI (read-only via share token). */
export function ExternalSharePage() {
  const { t } = useTranslation('externalShare')
  const { token: rawToken } = useParams()
  const token = rawToken?.trim() ?? ''

  return (
    <div className="external-share-shell">
      <header className="external-share-chrome">
        <Logo />
        <div className="external-share-chrome-meta">
          <p className="muted small">{t('guestHint')}</p>
          <LanguageSwitcher />
        </div>
      </header>
      <TaskDetailPage externalShareToken={token} />
    </div>
  )
}
