export function formatActivityTaskChipLabel(opts?: {
  number?: number | null
  title?: string | null
  publicId?: string | null
  showTitle?: boolean
}): string

export function isInaccessibleTaskRef(
  ref: { kind?: string; accessible?: boolean } | null | undefined,
): boolean

export function linkEventTaskIds(payload: Record<string, unknown> | null | undefined): {
  from: string | null
  to: string | null
  kind: string | null
}
