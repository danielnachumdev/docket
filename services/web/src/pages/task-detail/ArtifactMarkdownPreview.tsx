import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useState } from 'react'
import { api } from '../../api'

type Props = {
  taskId: string
  artifactId: number
  title: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; html: string }

marked.setOptions({ gfm: true, breaks: false })

export function ArtifactMarkdownPreview({ taskId, artifactId, title }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void (async () => {
      try {
        const blob = await api.fetchArtifactContentBlob(taskId, artifactId, title)
        const text = await blob.text()
        if (cancelled) return
        const raw = marked.parse(text, { async: false }) as string
        const html = DOMPurify.sanitize(raw, {
          USE_PROFILES: { html: true },
        })
        setState({ status: 'ready', html })
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Preview failed',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [taskId, artifactId, title])

  if (state.status === 'error') {
    return <p className="muted small artifact-preview-error">{state.message}</p>
  }
  if (state.status === 'loading') {
    return <p className="muted small">Loading preview…</p>
  }

  return (
    <div
      className="artifact-preview-md"
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  )
}
