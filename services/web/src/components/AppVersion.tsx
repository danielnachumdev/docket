import { useEffect, useState } from 'react'
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

  if (compact) {
    if (!update) {
      return <span className="app-version app-version-compact muted">{label}</span>
    }
    if (href) {
      return (
        <a
          className="app-version app-version-compact update"
          href={href}
          target="_blank"
          rel="noreferrer"
          title={`Update available: v${info.latest_version ?? ''}`}
        >
          {label}
          <span className="update-dot" aria-hidden="true" />
        </a>
      )
    }
    return (
      <span className="app-version app-version-compact update" title="Update available">
        {label}
        <span className="update-dot" aria-hidden="true" />
      </span>
    )
  }

  return (
    <div className="app-version">
      <span className="muted mono">{label}</span>
      {update &&
        (href ? (
          <a
            className="update-link"
            href={href}
            target="_blank"
            rel="noreferrer"
            title={info.latest_version ? `v${info.latest_version} available` : 'Update available'}
          >
            <Icon name="external" size={12} />
            Update available
          </a>
        ) : (
          <span className="update-link" title="Update available">
            Update available
          </span>
        ))}
    </div>
  )
}
