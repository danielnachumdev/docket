import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { User } from '../api'
import { initials } from '../lib/format'
import type { Theme } from '../lib/theme'
import { AppVersion, useAppVersion } from './AppVersion'
import { Icon, type IconName } from './Icon'

type NavItem = { to: string; label: string; icon: IconName; match: (path: string, search: string) => boolean }

const NAV: NavItem[] = [
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
  { to: '/tokens', label: 'API tokens', icon: 'key', match: (path) => path === '/tokens' },
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
  theme: Theme
  onToggleTheme: () => void
  onLogout: () => void
  children: ReactNode
}

export function AppLayout({ user, theme, onToggleTheme, onLogout, children }: Props) {
  const { pathname, search } = useLocation()
  const version = useAppVersion()
  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  const links = NAV.map((item) => {
    const active = item.match(pathname, search)
    return (
      <Link
        key={item.to}
        to={item.to}
        className={active ? 'nav-item active' : 'nav-item'}
        aria-current={active ? 'page' : undefined}
      >
        <Icon name={item.icon} size={18} />
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
