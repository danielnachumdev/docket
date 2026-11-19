import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'
import { useAnchoredFloating } from '../../lib/useAnchoredFloating'
import '../../components/Menu.css'

export type TaskSortMode = 'custom' | 'date'

type Props = {
  value: TaskSortMode
  onChange: (mode: TaskSortMode) => void
  className?: string
}

const MODES: TaskSortMode[] = ['date', 'custom']

export function SortModeMenu({ value, onChange, className }: Props) {
  const { t } = useTranslation('tasks')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const { floatingRef: listRef, placement, style } = useAnchoredFloating({
    anchorRef: triggerRef,
    open,
    align: 'end',
  })

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]:not(:disabled)')?.focus()

    function onPointer(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
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
  }, [listRef, open])

  const label = value === 'date' ? t('sortDate') : t('sortCustom')

  const menu =
    open
      ? createPortal(
          <div
            ref={listRef}
            id={menuId}
            className="menu-list"
            role="menu"
            aria-label={t('sortMode')}
            data-placement={placement}
            style={style}
          >
            {MODES.map((mode) => {
              const selected = value === mode
              return (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={selected ? 'menu-item active' : 'menu-item'}
                  onClick={() => {
                    setOpen(false)
                    triggerRef.current?.focus()
                    onChange(mode)
                  }}
                >
                  <Icon name={mode === 'date' ? 'calendar' : 'list'} />
                  {mode === 'date' ? t('sortDate') : t('sortCustom')}
                  {selected && <Icon name="check" size={14} className="menu-item-check" />}
                </button>
              )
            })}
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={className ? `menu sort-mode-menu ${className}` : 'menu sort-mode-menu'}>
      <button
        ref={triggerRef}
        type="button"
        className="btn ghost small chrome-control"
        aria-label={t('sortMode')}
        title={t('sortMode')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={value === 'date' ? 'calendar' : 'list'} size={14} />
        <span className="chrome-control-label">{label}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {menu}
    </div>
  )
}
