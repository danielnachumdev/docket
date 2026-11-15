import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { User } from '../api'
import { initials } from '../lib/format'
import type { ColorScheme } from '../lib/theme'
import { AppVersion, useAppVersion } from './AppVersion'
import { Icon } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'
import './ProfileMenu.css'

type Props = {
  user: User
  themeScheme: ColorScheme
  onToggleTheme: () => void
  onLogout: () => void
  align?: 'start' | 'end'
  showIdentity?: boolean
  className?: string
}

export function ProfileMenu({
  user,
  themeScheme,
  onToggleTheme,
  onLogout,
  align = 'start',
  showIdentity = false,
  className,
}: Props) {
  const { t } = useTranslation('common')
  const version = useAppVersion()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const themeLabel = themeScheme === 'dark' ? t('themeToLight') : t('themeToDark')

  useEffect(() => {
    if (!open) return
    panelRef.current
      ?.querySelector<HTMLElement>('a, button:not([disabled]), select')
      ?.focus()

    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const rootClass = [
    'profile-menu',
    align === 'end' ? 'align-end' : '',
    showIdentity ? 'with-identity' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        ref={triggerRef}
        type="button"
        className={showIdentity ? 'avatar-btn profile-trigger' : 'avatar-btn'}
        aria-label={t('accountMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(user.display_name)}
        </span>
        {showIdentity && (
          <>
            <span className="user-meta" aria-hidden="true">
              <strong>{user.display_name}</strong>
              {user.email && <span>{user.email}</span>}
            </span>
            <Icon name="more" className="profile-trigger-more" />
          </>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={menuId}
          className="profile-menu-panel"
          role="menu"
          aria-label={t('accountMenu')}
        >
          <div className="profile-menu-summary">
            <strong>{user.display_name}</strong>
            {user.email && <span>{user.email}</span>}
          </div>

          <Link
            to="/account"
            role="menuitem"
            className="menu-item"
            onClick={close}
          >
            <Icon name="users" />
            {t('account')}
          </Link>

          <div className="profile-menu-prefs" role="none">
            <div className="profile-menu-pref">
              <span>
                <Icon name={themeScheme === 'dark' ? 'moon' : 'sun'} />
                {t('theme')}
              </span>
              <button
                type="button"
                className="icon-btn"
                role="menuitem"
                aria-label={themeLabel}
                title={themeLabel}
                onClick={onToggleTheme}
              >
                <Icon name={themeScheme === 'dark' ? 'sun' : 'moon'} />
              </button>
            </div>
            <div className="profile-menu-pref">
              <span>
                <Icon name="globe" />
                {t('language')}
              </span>
              <LanguageSwitcher />
            </div>
          </div>

          <div className="profile-menu-divider" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            onClick={() => {
              close()
              onLogout()
            }}
          >
            <Icon name="logout" />
            {t('logOut')}
          </button>

          <div className="profile-menu-footer">
            <AppVersion info={version} compact />
          </div>
        </div>
      )}
    </div>
  )
}
