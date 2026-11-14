import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { api, type User } from '../api'
import { initials } from '../lib/format'
import type { Theme } from '../lib/theme'
import { AppVersion, useAppVersion } from './AppVersion'
import { Icon, type IconName } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'

type NavItem = {
  to: string
  label: string
  icon: IconName
  match: (path: string, search: string) => boolean
  badge?: number
}

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
  const { t } = useTranslation(['nav', 'common'])
  const { pathname, search } = useLocation()
  const version = useAppVersion()
  const [unread, setUnread] = useState(0)
  const themeLabel = theme === 'dark' ? t('common:themeToLight') : t('common:themeToDark')

  const navBase: Omit<NavItem, 'badge'>[] = [
    {
      to: '/',
      label: t('nav:tasks'),
      icon: 'tasks',
      match: (path, searchParams) =>
        (path === '/' && !searchParams.includes('view=archived')) || path.startsWith('/tasks/'),
    },
    {
      to: '/?view=archived',
      label: t('nav:archived'),
      icon: 'archive',
      match: (path, searchParams) => path === '/' && searchParams.includes('view=archived'),
    },
    {
      to: '/notifications',
      label: t('nav:inbox'),
      icon: 'bell',
      match: (path) => path === '/notifications',
    },
    {
      to: '/artifacts',
      label: t('nav:artifacts'),
      icon: 'paperclip',
      match: (path) => path === '/artifacts',
    },
    {
      to: '/tokens',
      label: t('nav:apiTokens'),
      icon: 'key',
      match: (path) => path === '/tokens',
    },
    {
      to: '/webhooks',
      label: t('nav:webhooks'),
      icon: 'webhook',
      match: (path) => path === '/webhooks',
    },
    {
      to: '/invites',
      label: t('nav:invites'),
      icon: 'users',
      match: (path) => path === '/invites',
    },
  ]

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

  const nav: NavItem[] = navBase
    .filter((item) => item.to !== '/invites' || canInvite)
    .map((item) => (item.to === '/notifications' ? { ...item, badge: unread } : item))

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
            <span className="nav-badge" aria-label={t('nav:unreadCount', { count: item.badge })}>
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
            <span>{t('common:appName')}</span>
          </Link>
          <nav className="nav" aria-label={t('nav:main')}>
            {links}
          </nav>
          <div className="sidebar-footer">
            <AppVersion info={version} />
            <LanguageSwitcher />
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
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onLogout}
                  aria-label={t('common:logOut')}
                  title={t('common:logOut')}
                >
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
          <span>{t('common:appName')}</span>
          <AppVersion info={version} compact />
        </Link>
        <div className="mobile-actions">
          <LanguageSwitcher className="mobile-lang" />
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeLabel}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="icon-btn" onClick={onLogout} aria-label={t('common:logOut')}>
            <Icon name="logout" />
          </button>
          <span className="avatar" title={user.display_name}>
            {initials(user.display_name)}
          </span>
        </div>
      </header>

      <div className="content">{children}</div>

      <nav className="tabbar" aria-label={t('nav:main')}>
        {links}
      </nav>
    </div>
  )
}
