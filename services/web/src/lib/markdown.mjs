/**
 * Shared GFM markdown → sanitized HTML for notes/description and comments.
 * Link chips show hostname only (no remote OG/oEmbed).
 */
import DOMPurify from 'dompurify'
import { Marked } from 'marked'

const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i

/** @param {string} value */
export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** @param {string | null | undefined} href */
export function hostnameOf(href) {
  if (!href) return ''
  try {
    const url = new URL(href, 'https://waymark.local')
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.hostname || href
    }
    if (url.protocol === 'mailto:') {
      return url.pathname || href.replace(/^mailto:/i, '')
    }
    return href
  } catch {
    return href
  }
}

/** @param {string | null | undefined} href */
export function isSafeHref(href) {
  if (!href || href.trim() === '') return false
  const trimmed = href.trim()
  if (trimmed.toLowerCase().startsWith('javascript:')) return false
  if (trimmed.toLowerCase().startsWith('data:')) return false
  if (trimmed.toLowerCase().startsWith('vbscript:')) return false
  return SAFE_HREF.test(trimmed)
}

/**
 * Compact hostname chip (phase 1 — no OG fetch).
 * @param {{ href: string, title?: string | null, text: string }} opts
 */
export function linkChipHtml({ href, title, text }) {
  if (!isSafeHref(href)) {
    return escapeHtml(text || href || '')
  }
  const host = hostnameOf(href)
  const tip = title?.trim() || text?.trim() || href
  const titleAttr = tip && tip !== host ? ` title="${escapeHtml(tip)}"` : ` title="${escapeHtml(href)}"`
  return (
    `<a class="md-link-chip" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${titleAttr}>` +
    `<span class="md-link-chip-host">${escapeHtml(host)}</span>` +
    `</a>`
  )
}

const marked = new Marked()
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    link({ href, title, text }) {
      return linkChipHtml({ href: href ?? '', title, text: text ?? '' })
    },
  },
})

/** DOMPurify options shared by description + comments. */
export const MARKDOWN_PURIFY = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target', 'rel', 'class', 'checked', 'disabled', 'type', 'start'],
  ADD_TAGS: ['input'],
}

/**
 * Parse GFM markdown to HTML (unsanitized). Prefer {@link renderMarkdown}.
 * @param {string} source
 */
export function parseMarkdown(source) {
  const text = source ?? ''
  if (!text.trim()) return ''
  return /** @type {string} */ (marked.parse(text, { async: false }))
}

/**
 * @param {string} html
 * @param {typeof DOMPurify | { sanitize: (dirty: string, cfg?: object) => string }} [purify]
 */
export function sanitizeMarkdownHtml(html, purify = DOMPurify) {
  if (!html) return ''
  return purify.sanitize(html, MARKDOWN_PURIFY)
}

/**
 * GFM → XSS-safe HTML with hostname link chips.
 * @param {string} source
 * @param {typeof DOMPurify | { sanitize: (dirty: string, cfg?: object) => string }} [purify]
 */
export function renderMarkdown(source, purify = DOMPurify) {
  return sanitizeMarkdownHtml(parseMarkdown(source), purify)
}

/**
 * Protect mention/ref spans so they survive markdown, then split for React chips.
 * Placeholder uses a private-use sentinel unlikely in user text.
 * @param {string} body
 * @param {{ start: number, end: number }[]} refs
 * @returns {{ markdown: string, order: number[] }}
 */
export function protectRefs(body, refs) {
  if (!refs?.length) return { markdown: body, order: [] }
  const ordered = [...refs]
    .map((ref, index) => ({ ref, index }))
    .filter(({ ref }) => ref.start >= 0 && ref.end > ref.start && ref.end <= body.length)
    .sort((a, b) => a.ref.start - b.ref.start)

  let cursor = 0
  let markdown = ''
  /** @type {number[]} */
  const order = []
  for (const { ref, index } of ordered) {
    if (ref.start < cursor) continue
    markdown += body.slice(cursor, ref.start)
    markdown += `\uE000${index}\uE001`
    order.push(index)
    cursor = ref.end
  }
  markdown += body.slice(cursor)
  return { markdown, order }
}

/**
 * Swap ref placeholders in sanitized HTML for empty inline mount slots, keeping
 * the surrounding block structure (paragraphs, lists, tables) in one document.
 * @param {string} html
 * @returns {string}
 */
export function slotRefPlaceholders(html) {
  return html.replace(
    /\uE000(\d+)\uE001/g,
    (_, index) => `<span class="wm-ref-slot" data-ref-index="${index}"></span>`,
  )
}
