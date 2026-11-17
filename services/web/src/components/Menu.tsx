import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredFloating } from '../lib/useAnchoredFloating'
import { Icon, type IconName } from './Icon'
import './Menu.css'

export type MenuItem = {
  label: string
  icon?: IconName
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

type Props = {
  label: string
  items: MenuItem[]
  icon?: IconName
  className?: string
}

export function Menu({ label, items, icon = 'more', className }: Props) {
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
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()

    function onPointer(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const entries = [
        ...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []),
      ]
      const index = entries.indexOf(document.activeElement as HTMLElement)
      const step = e.key === 'ArrowDown' ? 1 : -1
      entries[(index + step + entries.length) % entries.length]?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [listRef, open])

  const menu =
    open
      ? createPortal(
          <div
            ref={listRef}
            id={menuId}
            className="menu-list"
            role="menu"
            aria-label={label}
            data-placement={placement}
            style={style}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.danger ? 'menu-item danger' : 'menu-item'}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  triggerRef.current?.focus()
                  item.onSelect()
                }}
              >
                {item.icon && <Icon name={item.icon} />}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={className ? `menu ${className}` : 'menu'}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={icon} />
      </button>
      {menu}
    </div>
  )
}
