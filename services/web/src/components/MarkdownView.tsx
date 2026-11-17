import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  protectRefs,
  renderMarkdown,
  slotRefPlaceholders,
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
 * Chips are portalled into inline slots so they stay inside their paragraph.
 */
export function MarkdownWithRefs<T extends RefLike>({
  source,
  refs,
  className,
  renderRef,
}: MarkdownWithRefsProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState<{ index: number; el: HTMLElement }[]>([])
  const html = useMemo(() => {
    const { markdown } = protectRefs(source, refs)
    return slotRefPlaceholders(renderMarkdown(markdown))
  }, [source, refs])

  useLayoutEffect(() => {
    const found = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>('.wm-ref-slot') ?? []),
    ].map((el) => ({ index: Number(el.dataset.refIndex), el }))
    setSlots(found)
  }, [html])

  const classes = className ? `wm-md ${className}` : 'wm-md'
  return (
    <>
      <div
        ref={rootRef}
        {...userBidiAttrs(source, classes)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {slots.map(({ index, el }, i) => {
        const ref = refs[index]
        return ref ? createPortal(renderRef(ref, `ref-${index}-${i}`), el, `ref-${index}-${i}`) : null
      })}
    </>
  )
}
