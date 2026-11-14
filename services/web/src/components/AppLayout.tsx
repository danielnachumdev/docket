import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { api, type User } from '../api'
import type { Theme } from '../lib/theme'
import { Dialog } from './Dialog'
import docketIcon from '../assets/docket-icon.svg'
import { Icon, type IconName } from './Icon'
import { ProfileMenu } from './ProfileMenu'

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
      <img src={docketIcon} alt="" width={28} height={28} draggable={false} />
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

function useUnreadCount(pathname: string) {
  const [unread, setUnread] = useState(0)

  const refresh = useCallback(() => {
    void api
      .unreadNotificationCount()
      .then((body) => setUnread(body.count))
      .catch(() => setUnread(0))
  }, [])

  useEffect(() => {
    window.addEventListener('focus', refresh)
    window.addEventListener('docket:notifications', refresh)
    const timer = window.setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('docket:notifications', refresh)
      window.clearInterval(timer)
    }
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [pathname, refresh])

  return unread
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation('nav')
  return (
    <Link
      to={item.to}
      className={active ? 'nav-item active' : 'nav-item'}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      <span className="nav-icon-wrap">
        <Icon name={item.icon} size={18} />
        {item.badge != null && item.badge > 0 && (
          <span className="nav-badge" aria-label={t('unreadCount', { count: item.badge })}>
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </span>
      <span className="nav-label">{item.label}</span>
    </Link>
  )
}

export function AppLayout({
  user,
  theme,
  onToggleTheme,
  onLogout,
  children,
}: Props) {
  const { t } = useTranslation(['nav', 'common'])
  const { pathname, search } = useLocation()
  const unread = useUnreadCount(pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const isArchived = new URLSearchParams(search).get('view') === 'archived'
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const workspace: NavItem[] = [
    {
      to: '/',
      label: t('nav:tasks'),
      icon: 'tasks',
      match: (path) => (path === '/' && !isArchived) || path.startsWith('/tasks/'),
    },
    {
      to: '/notifications',
      label: t('nav:inbox'),
      icon: 'bell',
      match: (path) => path === '/notifications',
      badge: unread,
    },
    {
      to: '/artifacts',
      label: t('nav:artifacts'),
      icon: 'paperclip',
      match: (path) => path === '/artifacts',
    },
    {
      to: '/?view=archived',
      label: t('nav:archived'),
      icon: 'archive',
      match: (path) => path === '/' && isArchived,
    },
  ]

  const integrations: NavItem[] = [
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
      to: '/people',
      label: t('nav:people'),
      icon: 'users',
      match: (path) => path === '/people',
    },
    {
      to: '/invites',
      label: t('nav:invites'),
      icon: 'users',
      match: (path) => path === '/invites',
    },
    {
      to: '/storage',
      label: t('nav:storage'),
      icon: 'archive',
      match: (path) => path === '/storage',
    },
  ]

  const tabs = workspace.slice(0, 3)

  const renderGroup = (items: NavItem[], onNavigate?: () => void) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        item={item}
        active={item.match(pathname, search)}
        onNavigate={onNavigate}
      />
    ))

  const profileMenu = (
    <ProfileMenu
      user={user}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onLogout={onLogout}
    />
  )

  return (
    <div className="layout">
      <a className="skip-link" href="#main-content">
        {t('common:skipToContent')}
      </a>

      <aside className="sidebar">
        <div className="sidebar-inner">
          <Link to="/" className="brand">
            <Logo />
            <span>{t('common:appName')}</span>
          </Link>
          <nav className="nav" aria-label={t('nav:main')}>
            <div className="nav-group">
              <span className="nav-group-label">{t('nav:workspace')}</span>
              {renderGroup(workspace)}
            </div>
            <div className="nav-group">
              <span className="nav-group-label">{t('nav:integrations')}</span>
              {renderGroup(integrations)}
            </div>
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-footer-row">{profileMenu}</div>
          </div>
        </div>
      </aside>

      <header className="mobile-bar">
        <div className="mobile-bar-start">
          <button
            type="button"
            className="icon-btn"
            aria-label={t('nav:openMenu')}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <Link to="/" className="brand">
            <Logo />
            <span>{t('common:appName')}</span>
          </Link>
        </div>
        <ProfileMenu
          user={user}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onLogout={onLogout}
          align="end"
        />
      </header>

      <div className="content" id="main-content">
        {children}
      </div>

      <nav className="tabbar" aria-label={t('nav:main')}>
        {renderGroup(tabs)}
      </nav>

      {menuOpen && (
        <Dialog title={t('nav:menu')} variant="drawer" onClose={closeMenu}>
          <nav className="nav drawer-nav" aria-label={t('nav:menu')}>
            <div className="nav-group">
              <span className="nav-group-label">{t('nav:workspace')}</span>
              {renderGroup(workspace, closeMenu)}
            </div>
            <div className="nav-group">
              <span className="nav-group-label">{t('nav:integrations')}</span>
              {renderGroup(integrations, closeMenu)}
            </div>
          </nav>
        </Dialog>
      )}
    </div>
  )
}
