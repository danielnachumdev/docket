import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { HoverCardBindings } from '../lib/useHoverCard'
import './HoverCard.css'

const GAP_PX = 6
const EDGE_PX = 8

type CardProps = {
  anchor: HTMLElement | null
  children: ReactNode
  className?: string
  label?: string
  cardProps: HoverCardBindings['cardProps']
}

type Position = { top: number; left: number; placement: 'below' | 'above' }

/** Floating preview anchored to a trigger; flips above and clamps to the viewport. */
export function HoverCard({ anchor, children, className, label, cardProps }: CardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Position | null>(null)

  const place = useCallback(() => {
    const card = ref.current
    if (!anchor || !card) return
    const a = anchor.getBoundingClientRect()
    const w = card.offsetWidth
    const h = card.offsetHeight
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const rtl = getComputedStyle(anchor).direction === 'rtl'
    const below = a.bottom + GAP_PX
    const above = a.top - GAP_PX - h
    const fitsBelow = below + h <= vh - EDGE_PX
    const placement = fitsBelow || above < EDGE_PX ? 'below' : 'above'
    const preferred = rtl ? a.right - w : a.left
    const left = Math.min(Math.max(EDGE_PX, preferred), Math.max(EDGE_PX, vw - w - EDGE_PX))
    setPos({ top: placement === 'below' ? below : above, left, placement })
  }, [anchor])

  useLayoutEffect(() => {
    place()
    const card = ref.current
    const observer = card ? new ResizeObserver(place) : null
    if (card) observer?.observe(card)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [place])

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={['hover-card', className].filter(Boolean).join(' ')}
      data-placement={pos?.placement ?? 'below'}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      {...cardProps}
    >
      {children}
    </div>,
    document.body,
  )
}
