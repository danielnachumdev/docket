/** Shared GFM markdown → sanitized HTML for notes/description and comments. */

export function escapeHtml(value: string): string
export function hostnameOf(href: string | null | undefined): string
export function isSafeHref(href: string | null | undefined): boolean
export function linkChipHtml(opts: {
  href: string
  title?: string | null
  text: string
}): string

export const MARKDOWN_PURIFY: {
  USE_PROFILES: { html: true }
  ADD_ATTR: string[]
  ADD_TAGS: string[]
}

export function parseMarkdown(source: string): string
export function sanitizeMarkdownHtml(
  html: string,
  purify?: { sanitize: (dirty: string, cfg?: object) => string },
): string
export function renderMarkdown(
  source: string,
  purify?: { sanitize: (dirty: string, cfg?: object) => string },
): string

export function protectRefs(
  body: string,
  refs: { start: number; end: number }[],
): { markdown: string; order: number[] }

export function slotRefPlaceholders(html: string): string
