import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Artifact } from '../../api'
import { Icon } from '../../components/Icon'
import { getArtifactPreviewKind } from '../../lib/artifactMedia'
import { ArtifactFilePreview } from './ArtifactFilePreview'
import { ArtifactFullView } from './ArtifactFullView'
import { artifactAnchorId } from './commentAnchors'
import './CommentAttachmentList.css'

type Props = {
  taskId: string
  attachments: Artifact[]
}

function AttachmentCard({ taskId, art }: { taskId: string; art: Artifact }) {
  const { t } = useTranslation('artifacts')
  const [fullView, setFullView] = useState(false)
  const [hover, setHover] = useState(false)
  const previewKind = getArtifactPreviewKind(art)
  const showPreview =
    art.kind === 'file' &&
    Boolean(art.storage_key) &&
    (previewKind === 'image' ||
      previewKind === 'pdf' ||
      previewKind === 'video' ||
      previewKind === 'audio' ||
      previewKind === 'markdown' ||
      previewKind === 'text')
  const canLightbox = showPreview || art.kind === 'text'

  return (
    <li
      id={artifactAnchorId(art.id)}
      className="comment-attachment-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="comment-attachment-meta">
        <Icon name="paperclip" size={12} />
        {canLightbox ? (
          <button
            type="button"
            className="comment-attachment-title-btn"
            onClick={() => setFullView(true)}
            aria-label={t('enlargeNamed', { title: art.title })}
            title={t('enlarge')}
          >
            {art.title}
          </button>
        ) : (
          <span className="comment-attachment-title">{art.title}</span>
        )}
        <span className="muted small">
          {t(`kind.${art.kind}`, { defaultValue: art.kind })}
        </span>
      </div>
      {showPreview && (
        <div className="comment-attachment-preview">
          <ArtifactFilePreview taskId={taskId} artifact={art} />
        </div>
      )}
      {art.kind === 'link' && art.content_text && (
        <a
          className="comment-attachment-link"
          href={art.content_text}
          target="_blank"
          rel="noopener noreferrer"
        >
          {art.content_text}
        </a>
      )}
      {art.kind === 'text' && art.content_text && (
        <pre className="comment-attachment-text">{art.content_text}</pre>
      )}
      {hover && showPreview && previewKind === 'image' && (
        <p className="muted small comment-attachment-hint">{t('enlarge')}</p>
      )}
      {fullView && (
        <ArtifactFullView
          title={art.title}
          onClose={() => setFullView(false)}
          bodyClassName={
            art.kind === 'text' ? 'artifact-fullview-text' : 'artifact-fullview-media'
          }
        >
          {art.kind === 'text' && art.content_text ? (
            <pre className="artifact-fullview-pre">{art.content_text}</pre>
          ) : (
            <ArtifactFilePreview taskId={taskId} artifact={art} />
          )}
        </ArtifactFullView>
      )}
    </li>
  )
}

export function CommentAttachmentList({ taskId, attachments }: Props) {
  if (!attachments.length) return null

  return (
    <ul className="comment-attachment-list">
      {attachments.map((art) => (
        <AttachmentCard key={art.id} taskId={taskId} art={art} />
      ))}
    </ul>
  )
}
