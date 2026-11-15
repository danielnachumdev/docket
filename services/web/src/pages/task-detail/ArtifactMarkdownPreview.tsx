import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import i18n from '../../i18n'
import { userBidiAttrs } from '../../lib/bidi'
import { ArtifactEnlargeButton, ArtifactFullView } from './ArtifactFullView'
import { PreviewLoading } from './PreviewLoading'
import './ArtifactMarkdownPreview.css'

type Props = {
  taskId: string
  artifactId: number
  title: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; html: string; source: string }

marked.setOptions({ gfm: true, breaks: false })

export function ArtifactMarkdownPreview({ taskId, artifactId, title }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [fullView, setFullView] = useState(false)

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
        setState({ status: 'ready', html, source: text })
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : i18n.t('previewFailed', { ns: 'artifacts' }),
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
    return <PreviewLoading />
  }

  const mdProps = {
    ...userBidiAttrs(state.source, 'artifact-preview-md'),
    dangerouslySetInnerHTML: { __html: state.html },
  }

  return (
    <>
      <div className="artifact-preview-frame">
        <ArtifactEnlargeButton title={title} onClick={() => setFullView(true)} />
        <div {...mdProps} />
      </div>
      {fullView && (
        <ArtifactFullView title={title} onClose={() => setFullView(false)} bodyClassName="artifact-fullview-md">
          <div
            {...userBidiAttrs(state.source, 'artifact-preview-md')}
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        </ArtifactFullView>
      )}
    </>
  )
}
