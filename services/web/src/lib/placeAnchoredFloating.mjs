/** Viewport-aware placement for fixed floating UI (menus, hover cards). */

export const DEFAULT_GAP_PX = 6
export const DEFAULT_EDGE_PX = 8

/**
 * Prefer below the anchor; flip above when the floating box would overflow the
 * bottom edge and there is more room above. Clamp horizontally into the viewport.
 *
 * @param {{ top: number, right: number, bottom: number, left: number }} anchor
 * @param {{ width: number, height: number }} floating
 * @param {{ width: number, height: number }} viewport
 * @param {{ gapPx?: number, edgePx?: number, align?: 'start' | 'end', rtl?: boolean }} [options]
 * @returns {{ top: number, left: number, placement: 'below' | 'above' }}
 */
export function placeAnchoredFloating(anchor, floating, viewport, options = {}) {
  const gapPx = options.gapPx ?? DEFAULT_GAP_PX
  const edgePx = options.edgePx ?? DEFAULT_EDGE_PX
  const align = options.align ?? 'start'
  const rtl = Boolean(options.rtl)
  const { width: w, height: h } = floating
  const { width: vw, height: vh } = viewport

  const below = anchor.bottom + gapPx
  const above = anchor.top - gapPx - h
  const fitsBelow = below + h <= vh - edgePx
  const placement = fitsBelow || above < edgePx ? 'below' : 'above'

  const startLeft = rtl ? anchor.right - w : anchor.left
  const endLeft = rtl ? anchor.left : anchor.right - w
  const preferred = align === 'end' ? endLeft : startLeft
  const left = Math.min(Math.max(edgePx, preferred), Math.max(edgePx, vw - w - edgePx))

  return {
    top: placement === 'below' ? below : above,
    left,
    placement,
  }
}
