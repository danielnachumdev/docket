import { useEffect, useState } from 'react'
import { api } from '../../api'
import i18n from '../../i18n'
import { ArtifactEnlargeButton, ArtifactFullView } from './ArtifactFullView'
import { PreviewLoading } from './PreviewLoading'
import './ArtifactPlainTextPreview.css'

type Props = {
  taskId: string
  artifactId: number
  title: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; text: string }

export function ArtifactPlainTextPreview({ taskId, artifactId, title }: Props) {
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
        setState({ status: 'ready', text })
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

  return (
    <>
      <div className="artifact-preview-frame artifact-text-preview">
        <ArtifactEnlargeButton title={title} onClick={() => setFullView(true)} />
        {/* dir=auto: avoid forcing rtl on mixed files — that lets long LTR runs blow the column. */}
        <pre className="user-bidi" dir="auto">
          {state.text}
        </pre>
      </div>
      {fullView && (
        <ArtifactFullView
          title={title}
          onClose={() => setFullView(false)}
          bodyClassName="artifact-fullview-text"
        >
          <pre className="user-bidi" dir="auto">
            {state.text}
          </pre>
        </ArtifactFullView>
      )}
    </>
  )
}
