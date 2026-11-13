import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type User } from '../api'
import { initials } from '../lib/format'
import type { Theme } from '../lib/theme'
import { AppVersion, useAppVersion } from './AppVersion'
import { Icon, type IconName } from './Icon'

type NavItem = {
  to: string
  label: string
  icon: IconName
  match: (path: string, search: string) => boolean
  badge?: number
}

const NAV_BASE: Omit<NavItem, 'badge'>[] = [
  {
    to: '/',
    label: 'Tasks',
    icon: 'tasks',
    match: (path, search) =>
      (path === '/' && !search.includes('view=archived')) || path.startsWith('/tasks/'),
  },
  {
    to: '/?view=archived',
    label: 'Archived',
    icon: 'archive',
    match: (path, search) => path === '/' && search.includes('view=archived'),
  },
  {
    to: '/notifications',
    label: 'Inbox',
    icon: 'bell',
    match: (path) => path === '/notifications',
  },
  { to: '/tokens', label: 'API tokens', icon: 'key', match: (path) => path === '/tokens' },
  { to: '/webhooks', label: 'Webhooks', icon: 'webhook', match: (path) => path === '/webhooks' },
  {
    to: '/invites',
    label: 'Invites',
    icon: 'users',
    match: (path) => path === '/invites',
  },
]

export function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <Icon name="check" size={16} />
    </span>
  )
}

type Props = {
  user: User
  canInvite?: boolean
  theme: Theme
  onToggleTheme: () => void
  onLogout: () => void
  children: ReactNode
}

export function AppLayout({
  user,
  canInvite = false,
  theme,
  onToggleTheme,
  onLogout,
  children,
}: Props) {
  const { pathname, search } = useLocation()
  const version = useAppVersion()
  const [unread, setUnread] = useState(0)
  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  const refreshUnread = useCallback(() => {
    void api
      .unreadNotificationCount()
      .then((body) => setUnread(body.count))
      .catch(() => setUnread(0))
  }, [])

  useEffect(() => {
    refreshUnread()
    const onFocus = () => refreshUnread()
    const onCustom = () => refreshUnread()
    window.addEventListener('focus', onFocus)
    window.addEventListener('docket:notifications', onCustom)
    const timer = window.setInterval(refreshUnread, 30_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('docket:notifications', onCustom)
      window.clearInterval(timer)
    }
  }, [refreshUnread])

  useEffect(() => {
    refreshUnread()
  }, [pathname, refreshUnread])

  const nav: NavItem[] = NAV_BASE.filter(
    (item) => item.to !== '/invites' || canInvite,
  ).map((item) => (item.to === '/notifications' ? { ...item, badge: unread } : item))

  const links = nav.map((item) => {
    const active = item.match(pathname, search)
    return (
      <Link
        key={item.to}
        to={item.to}
        className={active ? 'nav-item active' : 'nav-item'}
        aria-current={active ? 'page' : undefined}
      >
        <span className="nav-icon-wrap">
          <Icon name={item.icon} size={18} />
          {item.badge != null && item.badge > 0 && (
            <span className="nav-badge" aria-label={`${item.badge} unread`}>
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </span>
        <span>{item.label}</span>
      </Link>
    )
  })

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <Link to="/" className="brand">
            <Logo />
            <span>Docket</span>
          </Link>
          <nav className="nav" aria-label="Main">
            {links}
          </nav>
          <div className="sidebar-footer">
            <AppVersion info={version} />
            <div className="sidebar-footer-row">
              <div className="user-chip">
                <span className="avatar">{initials(user.display_name)}</span>
                <span className="user-meta">
                  <strong>{user.display_name}</strong>
                  {user.email && <span>{user.email}</span>}
                </span>
              </div>
              <div className="sidebar-actions">
                <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
                  <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                </button>
                <button type="button" className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out">
                  <Icon name="logout" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <header className="mobile-bar">
        <Link to="/" className="brand">
          <Logo />
          <span>Docket</span>
          <AppVersion info={version} compact />
        </Link>
        <div className="mobile-actions">
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeLabel}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="icon-btn" onClick={onLogout} aria-label="Log out">
            <Icon name="logout" />
          </button>
          <span className="avatar" title={user.display_name}>
            {initials(user.display_name)}
          </span>
        </div>
      </header>

      <div className="content">{children}</div>

      <nav className="tabbar" aria-label="Main">
        {links}
      </nav>
    </div>
  )
}
