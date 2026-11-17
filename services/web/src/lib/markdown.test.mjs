import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hostnameOf,
  isSafeHref,
  linkChipHtml,
  parseMarkdown,
  protectRefs,
  renderMarkdown,
  sanitizeMarkdownHtml,
  slotRefPlaceholders,
} from './markdown.mjs'

/**
 * Minimal purify stand-in so unit tests stay Node-20-safe (jsdom→undici zstd
 * breaks on Node 20). Production still uses browser DOMPurify.
 * @param {string} dirty
 * @param {object} [_cfg]
 */
function stubPurifySanitize(dirty, _cfg) {
  return String(dirty)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

const stubPurify = { sanitize: stubPurifySanitize }

describe('hostnameOf / isSafeHref', () => {
  it('extracts hostnames from http(s) URLs', () => {
    assert.equal(hostnameOf('https://example.com/path?q=1'), 'example.com')
    assert.equal(hostnameOf('http://sub.example.org'), 'sub.example.org')
  })

  it('rejects javascript and data URLs', () => {
    assert.equal(isSafeHref('javascript:alert(1)'), false)
    assert.equal(isSafeHref('data:text/html,<script>'), false)
    assert.equal(isSafeHref('https://example.com'), true)
    assert.equal(isSafeHref('/relative'), true)
    assert.equal(isSafeHref('#anchor'), true)
  })
})

describe('linkChipHtml', () => {
  it('renders a compact hostname chip', () => {
    const html = linkChipHtml({
      href: 'https://example.com/docs',
      text: 'https://example.com/docs',
    })
    assert.match(html, /class="md-link-chip"/)
    assert.match(html, /md-link-chip-host">example\.com</)
    assert.match(html, /rel="noopener noreferrer"/)
    assert.match(html, /target="_blank"/)
  })

  it('neutralizes unsafe hrefs to plain text', () => {
    const html = linkChipHtml({ href: 'javascript:alert(1)', text: 'click' })
    assert.equal(html, 'click')
    assert.doesNotMatch(html, /<a/)
  })
})

describe('parseMarkdown GFM', () => {
  it('emits tables', () => {
    const html = parseMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n')
    assert.match(html, /<table>/)
    assert.match(html, /<th>a<\/th>/)
    assert.match(html, /<td>1<\/td>/)
  })

  it('emits task-list checkboxes', () => {
    const html = parseMarkdown('- [ ] open\n- [x] done\n')
    assert.match(html, /type="checkbox"/)
    assert.match(html, /checked/)
  })

  it('turns autolinks into hostname chips', () => {
    const html = parseMarkdown('See https://example.com/x\n')
    assert.match(html, /md-link-chip/)
    assert.match(html, /example\.com/)
  })
})

describe('sanitizeMarkdownHtml', () => {
  it('strips script tags and keeps tables/links via purify', () => {
    const dirty =
      '<table><tr><td>ok</td></tr></table>' +
      '<script>alert(1)</script>' +
      '<a class="md-link-chip" href="https://example.com" target="_blank" rel="noopener noreferrer">' +
      '<span class="md-link-chip-host">example.com</span></a>' +
      '<img src=x onerror=alert(1)>'
    const clean = sanitizeMarkdownHtml(dirty, stubPurify)
    assert.match(clean, /<table>/)
    assert.match(clean, /md-link-chip/)
    assert.doesNotMatch(clean, /<script/i)
    assert.doesNotMatch(clean, /onerror/i)
  })

  it('renderMarkdown end-to-end drops XSS from source', () => {
    const html = renderMarkdown(
      'hi <script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n| a |\n| - |\n| 1 |\n',
      stubPurify,
    )
    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /javascript:/i)
    assert.match(html, /<table>/)
  })
})

describe('protectRefs / slotRefPlaceholders', () => {
  it('keeps refs inline inside the paragraph they were written in', () => {
    const body = 'Shot &5, memo &6.\n\nSee ~2'
    const refs = [
      { start: 5, end: 7 },
      { start: 14, end: 16 },
      { start: 23, end: 25 },
    ]
    const { markdown } = protectRefs(body, refs)
    assert.equal(markdown.includes('&5'), false)
    const html = slotRefPlaceholders(
      renderMarkdown(markdown, { sanitize: stubPurifySanitize }),
    )
    const slot = (i) => `<span class="wm-ref-slot" data-ref-index="${i}"></span>`
    assert.ok(html.includes(`<p>Shot ${slot(0)}, memo ${slot(1)}.</p>`), html)
    assert.ok(html.includes(`<p>See ${slot(2)}</p>`), html)
    assert.equal((html.match(/<p>/g) ?? []).length, 2)
  })
})
