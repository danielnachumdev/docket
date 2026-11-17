import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import {
  placeAnchoredFloating,
  type FloatingPlacement,
  type PlaceAnchoredFloatingOptions,
} from './placeAnchoredFloating'

type Options = {
  /** Prefer a live ref so open/close always reads the current trigger node. */
  anchorRef?: RefObject<HTMLElement | null>
  /** Static anchor (e.g. HoverCard); ignored when `anchorRef` is set. */
  anchor?: HTMLElement | null
  /** When false, clears position and skips listeners. */
  open: boolean
  align?: PlaceAnchoredFloatingOptions['align']
  gapPx?: number
  edgePx?: number
}

type AnchoredFloating = {
  floatingRef: RefObject<HTMLDivElement | null>
  placement: FloatingPlacement
  style: CSSProperties
}

/**
 * Positions a fixed floating panel relative to an anchor with viewport flip/clamp.
 * Pair with `createPortal(..., document.body)` so overflow:hidden ancestors cannot clip it.
 */
export function useAnchoredFloating({
  anchorRef,
  anchor = null,
  open,
  align = 'start',
  gapPx,
  edgePx,
}: Options): AnchoredFloating {
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{
    top: number
    left: number
    placement: FloatingPlacement
  } | null>(null)

  const place = useCallback(() => {
    const floating = floatingRef.current
    const target = anchorRef?.current ?? anchor
    if (!open || !target || !floating) return
    const a = target.getBoundingClientRect()
    const rtl = getComputedStyle(target).direction === 'rtl'
    const next = placeAnchoredFloating(
      a,
      { width: floating.offsetWidth, height: floating.offsetHeight },
      { width: document.documentElement.clientWidth, height: window.innerHeight },
      { align, gapPx, edgePx, rtl },
    )
    setPos(next)
  }, [align, anchor, anchorRef, edgePx, gapPx, open])

  useLayoutEffect(() => {
    if (!open) return
    place()
    const floating = floatingRef.current
    const observer = floating ? new ResizeObserver(place) : null
    if (floating) observer?.observe(floating)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  const ready = open && pos !== null
  return {
    floatingRef,
    placement: pos?.placement ?? 'below',
    style: {
      position: 'fixed',
      top: pos?.top ?? -9999,
      left: pos?.left ?? -9999,
      visibility: ready ? 'visible' : 'hidden',
    },
  }
}
