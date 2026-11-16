import { useMemo, type ReactNode } from 'react'
import {
  protectRefs,
  renderMarkdown,
  splitRefPlaceholders,
} from '../lib/markdown'
import { userBidiAttrs } from '../lib/bidi'
import './MarkdownView.css'

type MarkdownViewProps = {
  source: string
  className?: string
  empty?: ReactNode
}

/** XSS-safe GFM view (tables, task lists, fenced code, hostname link chips). */
export function MarkdownView({ source, className, empty }: MarkdownViewProps) {
  const html = useMemo(() => renderMarkdown(source), [source])
  if (!source.trim()) {
    return empty ? <>{empty}</> : null
  }
  const classes = className ? `wm-md ${className}` : 'wm-md'
  return (
    <div {...userBidiAttrs(source, classes)} dangerouslySetInnerHTML={{ __html: html }} />
  )
}

type RefLike = {
  start: number
  end: number
}

type MarkdownWithRefsProps<T extends RefLike> = {
  source: string
  refs: T[]
  className?: string
  renderRef: (ref: T, key: string) => ReactNode
}

/**
 * Render markdown while preserving interactive mention/ref chips at original spans.
 */
export function MarkdownWithRefs<T extends RefLike>({
  source,
  refs,
  className,
  renderRef,
}: MarkdownWithRefsProps<T>) {
  const parts = useMemo(() => {
    if (!refs.length) {
      return [{ type: 'html' as const, value: renderMarkdown(source) }]
    }
    const { markdown } = protectRefs(source, refs)
    const html = renderMarkdown(markdown)
    return splitRefPlaceholders(html)
  }, [source, refs])

  const classes = className ? `wm-md ${className}` : 'wm-md'
  return (
    <div {...userBidiAttrs(source, classes)}>
      {parts.map((part, i) => {
        if (part.type === 'html') {
          if (!part.value) return null
          return (
            <span
              key={`h-${i}`}
              dangerouslySetInnerHTML={{ __html: part.value }}
            />
          )
        }
        const ref = refs[part.index]
        if (!ref) return null
        return <span key={`r-${i}`}>{renderRef(ref, `ref-${part.index}-${i}`)}</span>
      })}
    </div>
  )
}
