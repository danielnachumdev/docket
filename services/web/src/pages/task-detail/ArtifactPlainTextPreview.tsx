import { useState } from 'react'
import { useArtifactText } from '../../lib/useArtifactText'
import { ArtifactEnlargeButton, ArtifactFullView } from './ArtifactFullView'
import { PreviewLoading } from './PreviewLoading'
import './ArtifactPlainTextPreview.css'

type Props = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export function ArtifactPlainTextPreview({ taskId, artifactId, title, contentType }: Props) {
  const state = useArtifactText({ taskId, artifactId, title, contentType })
  const [fullView, setFullView] = useState(false)

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
