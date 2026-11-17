import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { HoverCardBindings } from '../lib/useHoverCard'
import { useAnchoredFloating } from '../lib/useAnchoredFloating'
import './HoverCard.css'

type CardProps = {
  anchor: HTMLElement | null
  children: ReactNode
  className?: string
  label?: string
  cardProps: HoverCardBindings['cardProps']
}

/** Floating preview anchored to a trigger; flips above and clamps to the viewport. */
export function HoverCard({ anchor, children, className, label, cardProps }: CardProps) {
  const { floatingRef, placement, style } = useAnchoredFloating({
    anchor,
    open: Boolean(anchor),
    align: 'start',
  })

  return createPortal(
    <div
      ref={floatingRef}
      role="dialog"
      aria-label={label}
      className={['hover-card', className].filter(Boolean).join(' ')}
      data-placement={placement}
      style={style}
      {...cardProps}
    >
      {children}
    </div>,
    document.body,
  )
}
