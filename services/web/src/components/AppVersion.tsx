import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type VersionStatus } from '../api'
import { Icon } from './Icon'

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

  const label = `v${info.version}`
  const update = info.update_available
  const href = info.release_url
  const updateTitle = info.latest_version
    ? t('updateAvailableVersion', { version: info.latest_version })
    : t('updateAvailable')
  const notesTitle = href ? t('releaseNotes') : undefined

  if (compact) {
    return (
      <ReleaseNotesLink
        href={href}
        className={`app-version app-version-compact${update ? ' update' : ' muted'}`}
        title={update ? updateTitle : notesTitle}
      >
        {label}
        {update ? <span className="update-dot" aria-hidden="true" /> : null}
      </ReleaseNotesLink>
    )
  }

  return (
    <div className="app-version">
      <ReleaseNotesLink
        href={href}
        className={`mono version-link${href ? '' : ' muted'}`}
        title={notesTitle}
      >
        {label}
      </ReleaseNotesLink>
      {update ? (
        <ReleaseNotesLink
          href={href}
          className="update-link"
          title={
            info.latest_version
              ? t('versionAvailable', { version: info.latest_version })
              : t('updateAvailable')
          }
        >
          <Icon name="external" size={12} />
          {t('updateAvailable')}
        </ReleaseNotesLink>
      ) : null}
    </div>
  )
}
