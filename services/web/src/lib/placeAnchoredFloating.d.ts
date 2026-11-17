/** Viewport-aware placement for fixed floating UI (menus, hover cards). */

export const DEFAULT_GAP_PX: number
export const DEFAULT_EDGE_PX: number

export type FloatingPlacement = 'below' | 'above'

export type FloatingPosition = {
  top: number
  left: number
  placement: FloatingPlacement
}

export type PlaceAnchoredFloatingOptions = {
  gapPx?: number
  edgePx?: number
  /** Horizontal alignment to the anchor (inline start/end; respects `rtl`). */
  align?: 'start' | 'end'
  rtl?: boolean
}

/**
 * Prefer below the anchor; flip above when the floating box would overflow the
 * bottom edge and there is more room above. Clamp horizontally into the viewport.
 */
export function placeAnchoredFloating(
  anchor: { top: number; right: number; bottom: number; left: number },
  floating: { width: number; height: number },
  viewport: { width: number; height: number },
  options?: PlaceAnchoredFloatingOptions,
): FloatingPosition
