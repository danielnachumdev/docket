import { useEffect, useState } from 'react'
import { api } from '../../api'
import i18n from '../../i18n'
import { userBidiAttrs } from '../../lib/bidi'
import { renderMarkdown } from '../../lib/markdown'
import { ArtifactEnlargeButton, ArtifactFullView } from './ArtifactFullView'
import { PreviewLoading } from './PreviewLoading'
import '../../components/MarkdownView.css'
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
        const html = renderMarkdown(text)
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
    ...userBidiAttrs(state.source, 'wm-md artifact-preview-md'),
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
            {...userBidiAttrs(state.source, 'wm-md artifact-preview-md')}
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        </ArtifactFullView>
      )}
    </>
  )
}
