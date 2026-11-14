import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { api, type User } from '../api'
import type { Theme } from '../lib/theme'
import { Dialog } from './Dialog'
import waymarkIcon from '../assets/waymark-icon.svg'
import { Icon, type IconName } from './Icon'
import { ProfileMenu } from './ProfileMenu'

type NavItem = {
  to: string
  label: string
  icon: IconName
  match: (path: string, search: string) => boolean
  badge?: number
}

type NavGroup = {
  id: string
  label: string
  items: NavItem[]
}

export function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <img src={waymarkIcon} alt="" width={28} height={28} draggable={false} />
    </span>
  )
}

type Props = {
  user: User
  theme: Theme
  onToggleTheme: () => void
  onLogout: () => void
  canAdmin?: boolean
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
    window.addEventListener('waymark:notifications', refresh)
    const timer = window.setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('waymark:notifications', refresh)
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
  const badge = item.badge != null && item.badge > 0 ? (item.badge > 99 ? '99+' : item.badge) : null
  return (
    <Link
      to={item.to}
      className={active ? 'nav-item active' : 'nav-item'}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      <span className="nav-icon-wrap">
        <Icon name={item.icon} size={18} />
        {badge != null && (
          <span className="nav-badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </span>
      <span className="nav-label">{item.label}</span>
      {badge != null && (
        <span className="nav-count" aria-label={t('unreadCount', { count: item.badge })}>
          {badge}
        </span>
      )}
    </Link>
  )
}

export function AppLayout({
  user,
  theme,
  onToggleTheme,
  onLogout,
  canAdmin = false,
  children,
}: Props) {
  const { t } = useTranslation(['nav', 'common'])
  const { pathname, search } = useLocation()
  const unread = useUnreadCount(pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const isArchived = new URLSearchParams(search).get('view') === 'archived'
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const page = (to: string, label: string, icon: IconName, badge?: number): NavItem => ({
    to,
    label,
    icon,
    badge,
    match: (path) => path === to,
  })

  const groups: NavGroup[] = [
    {
      id: 'workspace',
      label: t('nav:workspace'),
      items: [
        {
          to: '/',
          label: t('nav:tasks'),
          icon: 'tasks',
          match: (path) => (path === '/' && !isArchived) || path.startsWith('/tasks/'),
        },
        page('/notifications', t('nav:inbox'), 'bell', unread),
        page('/artifacts', t('nav:artifacts'), 'paperclip'),
        {
          to: '/?view=archived',
          label: t('nav:archived'),
          icon: 'archive',
          match: (path) => path === '/' && isArchived,
        },
      ],
    },
    {
      id: 'team',
      label: t('nav:team'),
      items: [
        page('/people', t('nav:people'), 'users'),
        page('/invites', t('nav:invites'), 'userPlus'),
      ],
    },
    {
      id: 'integrations',
      label: t('nav:integrations'),
      items: [
        page('/tokens', t('nav:apiTokens'), 'key'),
        page('/webhooks', t('nav:webhooks'), 'webhook'),
      ],
    },
    ...(canAdmin
      ? [
          {
            id: 'admin',
            label: t('nav:admin'),
            items: [page('/storage', t('nav:storage'), 'database')],
          },
        ]
      : []),
  ]

  const tabs = groups[0].items.slice(0, 3)
  const onTabRoute = tabs.some((item) => item.match(pathname, search))

  const renderItems = (items: NavItem[], onNavigate?: () => void) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        item={item}
        active={item.match(pathname, search)}
        onNavigate={onNavigate}
      />
    ))

  const renderGroups = (onNavigate?: () => void) =>
    groups.map((group) => (
      <div key={group.id} className="nav-group">
        <span className="nav-group-label">{group.label}</span>
        {renderItems(group.items, onNavigate)}
      </div>
    ))

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
            {renderGroups()}
          </nav>
          <div className="sidebar-footer">
            <ProfileMenu
              user={user}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onLogout={onLogout}
              showIdentity
            />
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
        {renderItems(tabs)}
        <button
          type="button"
          className={onTabRoute ? 'nav-item' : 'nav-item active'}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <span className="nav-icon-wrap">
            <Icon name="menu" size={18} />
          </span>
          <span className="nav-label">{t('nav:more')}</span>
        </button>
      </nav>

      {menuOpen && (
        <Dialog title={t('nav:menu')} variant="drawer" onClose={closeMenu}>
          <nav className="nav drawer-nav" aria-label={t('nav:menu')}>
            {renderGroups(closeMenu)}
          </nav>
        </Dialog>
      )}
    </div>
  )
}
