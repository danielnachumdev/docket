import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from 'react'

const OPEN_DELAY_MS = 160
/** Long enough to cross the gap from the trigger into the card (e.g. to press play). */
const CLOSE_DELAY_MS = 180

type Options = {
  enabled?: boolean
}

/**
 * Hover/focus-driven popover state. Mouse pointers only — taps on touch screens
 * fall through to the trigger's click action instead of opening a card.
 */
export function useHoverCard({ enabled = true }: Options = {}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const timer = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }, [])

  const scheduleOpen = useCallback(() => {
    clear()
    timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS)
  }, [clear])

  const scheduleClose = useCallback(() => {
    clear()
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }, [clear])

  const close = useCallback(() => {
    clear()
    setOpen(false)
  }, [clear])

  useEffect(() => clear, [clear])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close, open])

  const anchorProps = {
    ref: setAnchor,
    onPointerEnter: (e: PointerEvent) => {
      if (enabled && e.pointerType === 'mouse') scheduleOpen()
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') scheduleClose()
    },
    onFocus: (e: FocusEvent) => {
      if (enabled && e.currentTarget.matches(':focus-visible')) {
        clear()
        setOpen(true)
      }
    },
    onBlur: scheduleClose,
  }

  const cardProps = {
    onPointerEnter: clear,
    onPointerLeave: scheduleClose,
    onFocus: clear,
    onBlur: scheduleClose,
  }

  return { open: enabled && open, anchor, anchorProps, cardProps, close }
}

export type HoverCardBindings = ReturnType<typeof useHoverCard>
