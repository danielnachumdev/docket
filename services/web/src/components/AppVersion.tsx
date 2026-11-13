import { useEffect, useState, type ReactNode } from 'react'
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
  if (!info?.version) return null

  const label = `v${info.version}`
  const update = info.update_available
  const href = info.release_url
  const updateTitle = info.latest_version
    ? `Update available: v${info.latest_version}`
    : 'Update available'

  if (compact) {
    return (
      <ReleaseNotesLink
        href={href}
        className={`app-version app-version-compact${update ? ' update' : ' muted'}`}
        title={update ? updateTitle : href ? 'Release notes' : undefined}
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
        title={href ? 'Release notes' : undefined}
      >
        {label}
      </ReleaseNotesLink>
      {update ? (
        <ReleaseNotesLink
          href={href}
          className="update-link"
          title={info.latest_version ? `v${info.latest_version} available` : 'Update available'}
        >
          <Icon name="external" size={12} />
          Update available
        </ReleaseNotesLink>
      ) : null}
    </div>
  )
}
