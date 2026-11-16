import { useTranslation } from 'react-i18next'
import type { Artifact } from '../../api'
import { Icon } from '../../components/Icon'
import { getArtifactPreviewKind } from '../../lib/artifactMedia'
import { ArtifactFilePreview } from './ArtifactFilePreview'
import './CommentAttachmentList.css'

type Props = {
  taskId: string
  attachments: Artifact[]
}

export function CommentAttachmentList({ taskId, attachments }: Props) {
  const { t } = useTranslation('artifacts')
  if (!attachments.length) return null

  return (
    <ul className="comment-attachment-list">
      {attachments.map((art) => {
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
        return (
          <li key={art.id} id={`artifact-${art.id}`} className="comment-attachment-card">
            <div className="comment-attachment-meta">
              <Icon name="paperclip" size={12} />
              <span className="comment-attachment-title">{art.title}</span>
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
          </li>
        )
      })}
    </ul>
  )
}
