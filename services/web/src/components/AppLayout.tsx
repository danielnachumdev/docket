import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { api, type User } from '../api'
import { initials } from '../lib/format'
import type { Theme } from '../lib/theme'
import { AppVersion, useAppVersion } from './AppVersion'
import { Dialog } from './Dialog'
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
  canInvite = false,
  theme,
  onToggleTheme,
  onLogout,
  children,
}: Props) {
  const { t } = useTranslation(['nav', 'common'])
  const { pathname, search } = useLocation()
  const version = useAppVersion()
  const unread = useUnreadCount(pathname)
  const [moreOpen, setMoreOpen] = useState(false)
  const themeLabel = theme === 'dark' ? t('common:themeToLight') : t('common:themeToDark')
  const isArchived = new URLSearchParams(search).get('view') === 'archived'

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
    ...(canInvite
      ? [
          {
            to: '/invites',
            label: t('nav:invites'),
            icon: 'users' as const,
            match: (path: string) => path === '/invites',
          },
        ]
      : []),
  ]

  const tabs = workspace.slice(0, 3)
  const overflow = [...workspace.slice(3), ...integrations]
  const overflowActive = overflow.some((item) => item.match(pathname, search))

  const renderGroup = (items: NavItem[], onNavigate?: () => void) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        item={item}
        active={item.match(pathname, search)}
        onNavigate={onNavigate}
      />
    ))

  const userChip = (
    <div className="user-chip">
      <span className="avatar" aria-hidden="true">
        {initials(user.display_name)}
      </span>
      <span className="user-meta">
        <strong>{user.display_name}</strong>
        {user.email && <span>{user.email}</span>}
      </span>
    </div>
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
            <div className="sidebar-footer-row">
              <LanguageSwitcher />
              <button
                type="button"
                className="icon-btn"
                onClick={onToggleTheme}
                aria-label={themeLabel}
                title={themeLabel}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              </button>
            </div>
            <div className="sidebar-footer-row">
              {userChip}
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
            <AppVersion info={version} />
          </div>
        </div>
      </aside>

      <header className="mobile-bar">
        <Link to="/" className="brand">
          <Logo />
          <span>{t('common:appName')}</span>
        </Link>
        <button
          type="button"
          className="avatar-btn"
          aria-label={t('common:account')}
          onClick={() => setMoreOpen(true)}
        >
          <span className="avatar" aria-hidden="true">
            {initials(user.display_name)}
          </span>
        </button>
      </header>

      <div className="content" id="main-content">
        {children}
      </div>

      <nav className="tabbar" aria-label={t('nav:main')}>
        {renderGroup(tabs)}
        <button
          type="button"
          className={overflowActive ? 'nav-item active' : 'nav-item'}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <span className="nav-icon-wrap">
            <Icon name="menu" size={18} />
          </span>
          <span className="nav-label">{t('nav:more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <Dialog title={t('nav:more')} variant="sheet" onClose={() => setMoreOpen(false)}>
          <div className="sheet-section">{userChip}</div>
          <nav className="nav sheet-nav" aria-label={t('nav:more')}>
            {renderGroup(overflow, () => setMoreOpen(false))}
          </nav>
          <div className="sheet-settings">
            <div className="sheet-setting">
              <span>
                <Icon name="globe" />
                {t('common:language')}
              </span>
              <LanguageSwitcher />
            </div>
            <div className="sheet-setting">
              <span>
                <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
                {t('common:theme')}
              </span>
              <div className="segmented" role="radiogroup" aria-label={t('common:theme')}>
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={theme === mode}
                    className={theme === mode ? 'active' : ''}
                    onClick={() => theme !== mode && onToggleTheme()}
                  >
                    {mode === 'light' ? t('common:themeLight') : t('common:themeDark')}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="sheet-footer">
            <AppVersion info={version} />
            <button type="button" className="btn ghost danger" onClick={onLogout}>
              <Icon name="logout" />
              {t('common:logOut')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
