import { useMemo, useState } from 'react'
import { userBidiAttrs } from '../../lib/bidi'
import { renderMarkdown } from '../../lib/markdown'
import { useArtifactText } from '../../lib/useArtifactText'
import { ArtifactEnlargeButton, ArtifactFullView } from './ArtifactFullView'
import { PreviewLoading } from './PreviewLoading'
import '../../components/MarkdownView.css'
import './ArtifactMarkdownPreview.css'

type Props = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export function ArtifactMarkdownPreview({ taskId, artifactId, title, contentType }: Props) {
  const state = useArtifactText({ taskId, artifactId, title, contentType })
  const [fullView, setFullView] = useState(false)
  const source = state.status === 'ready' ? state.text : ''
  const html = useMemo(() => renderMarkdown(source), [source])

  if (state.status === 'error') {
    return <p className="muted small artifact-preview-error">{state.message}</p>
  }
  if (state.status === 'loading') {
    return <PreviewLoading />
  }

  const mdProps = {
    ...userBidiAttrs(source, 'wm-md artifact-preview-md'),
    dangerouslySetInnerHTML: { __html: html },
  }

  return (
    <>
      <div className="artifact-preview-frame">
        <ArtifactEnlargeButton title={title} onClick={() => setFullView(true)} />
        <div {...mdProps} />
      </div>
      {fullView && (
        <ArtifactFullView title={title} onClose={() => setFullView(false)} bodyClassName="artifact-fullview-md">
          <div {...mdProps} />
        </ArtifactFullView>
      )}
    </>
  )
}
