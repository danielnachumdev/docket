import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type VersionStatus } from '../api'
import './AppVersion.css'

export function useAppVersion(): VersionStatus | null {
  const [info, setInfo] = useState<VersionStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void api
      .version()
      .then((body) => {
        if (!cancelled) setInfo(body)
      })
      .catch(() => {
        if (!cancelled) setInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return info
}

function ReleaseNotesLink({
  href,
  className,
  title,
  children,
}: {
  href: string | null
  className?: string
  title?: string
  children: ReactNode
}) {
  if (!href) {
    return (
      <span className={className} title={title}>
        {children}
      </span>
    )
  }
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
    >
      {children}
    </a>
  )
}

export function AppVersion({
  info,
  compact = false,
}: {
  info: VersionStatus | null
  compact?: boolean
}) {
  const { t } = useTranslation('common')
  if (!info?.version) return null

  const current = `v${info.version}`
  const showUpgrade = Boolean(info.update_available && info.latest_version)
  const label = showUpgrade
    ? t('versionUpgrade', { current: info.version, latest: info.latest_version })
    : current
  const href = showUpgrade ? info.release_url : null
  const title = showUpgrade
    ? href
      ? t('releaseNotes')
      : t('updateAvailableVersion', { version: info.latest_version })
    : undefined

  const className = [
    'app-version',
    compact ? 'app-version-compact' : 'mono version-link',
    showUpgrade ? 'update' : 'muted',
  ].join(' ')

  return (
    <ReleaseNotesLink href={href} className={className} title={title}>
      {label}
    </ReleaseNotesLink>
  )
}
