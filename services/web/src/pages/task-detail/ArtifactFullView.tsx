import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
  /** Extra class on the scrollable body (e.g. markdown styles). */
  bodyClassName?: string
}

/** Full-viewport overlay for readable artifact previews (documents, media). */
export function ArtifactFullView({ title, onClose, children, bodyClassName }: Props) {
  const { t } = useTranslation('common')
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>('.artifact-fullview-close')?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
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

  const bodyClass = ['artifact-fullview-body', bodyClassName].filter(Boolean).join(' ')

  return createPortal(
    <div
      className="artifact-lightbox artifact-fullview"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        className="artifact-fullview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artifact-fullview-header">
          <h2 id={titleId} className="artifact-fullview-title truncate">
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn artifact-fullview-close"
            aria-label={t('close')}
            title={t('close')}
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>
        <div className={bodyClass}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

type EnlargeProps = {
  title: string
  onClick: () => void
  className?: string
}

/** Explicit control to open {@link ArtifactFullView}. */
export function ArtifactEnlargeButton({ title, onClick, className }: EnlargeProps) {
  const { t } = useTranslation('artifacts')
  return (
    <button
      type="button"
      className={['icon-btn', 'artifact-enlarge-btn', className].filter(Boolean).join(' ')}
      aria-label={t('enlargeNamed', { title })}
      title={t('enlarge')}
      onClick={onClick}
    >
      <Icon name="maximize" />
    </button>
  )
}
