import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type Props = {
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  footer?: ReactNode
  size?: 'sm' | 'md'
  variant?: 'center' | 'sheet'
  children?: ReactNode
}

export function Dialog({
  title,
  description,
  onClose,
  footer,
  size = 'sm',
  variant = 'center',
  children,
}: Props) {
  const { t } = useTranslation('common')
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const autofocus =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector('.dialog-body')?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel?.querySelector<HTMLElement>('.dialog-footer .btn:last-child')
    autofocus?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    document.body.classList.add('dialog-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('dialog-open')
      previous?.focus?.()
    }
  }, [])

  return createPortal(
    <div className={`modal-backdrop backdrop-${variant}`} role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={`modal modal-${size} modal-${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        {description && (
          <p id={descId} className="dialog-description">
            {description}
          </p>
        )}
        {children && <div className="dialog-body">{children}</div>}
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
