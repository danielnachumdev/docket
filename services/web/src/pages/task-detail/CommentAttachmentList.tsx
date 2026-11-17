import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Artifact } from '../../api'
import { Icon } from '../../components/Icon'
import { UserBidiText } from '../../components/UserBidiText'
import { artifactKindIcon, externalLinkUrl, isViewableArtifact } from '../../lib/artifactMedia'
import { hostnameOf } from '../../lib/markdown'
import { ArtifactFilePreview } from './ArtifactFilePreview'
import { ArtifactLightbox } from './ArtifactLightbox'
import { artifactAnchorId } from './commentAnchors'
import './ArtifactRow.css'
import './CommentAttachmentList.css'

type Props = {
  taskId: string
  attachments: Artifact[]
}

function AttachmentCard({ taskId, art }: { taskId: string; art: Artifact }) {
  const { t } = useTranslation('artifacts')
  const [fullView, setFullView] = useState(false)
  const linkUrl = externalLinkUrl(art)
  const viewable = isViewableArtifact(art)
  const inlineText = art.kind === 'text' || art.kind === 'json' ? art.content_text : null
  const typeLabel = linkUrl ? hostnameOf(linkUrl) : t(`kind.${art.kind}`, { defaultValue: art.kind })

  return (
    <li id={artifactAnchorId(art.id)} className="artifact-card comment-attachment-card">
      <div className="comment-attachment-meta">
        <Icon name={artifactKindIcon(art.kind)} size={13} />
        {linkUrl ? (
          <a
            className="comment-attachment-title"
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={linkUrl}
          >
            <UserBidiText text={art.title} className="truncate" />
          </a>
        ) : viewable ? (
          <button
            type="button"
            className="comment-attachment-title"
            onClick={() => setFullView(true)}
            aria-label={t('enlargeNamed', { title: art.title })}
            title={t('enlarge')}
          >
            <UserBidiText text={art.title} className="truncate" />
          </button>
        ) : (
          <UserBidiText text={art.title} className="comment-attachment-title truncate" />
        )}
        <span className="muted small comment-attachment-type">{typeLabel}</span>
        {linkUrl && <Icon name="external" size={12} className="comment-attachment-ext" />}
      </div>
      {inlineText ? (
        <pre className="comment-attachment-text" dir="auto">
          {inlineText}
        </pre>
      ) : (
        <div className="comment-attachment-preview">
          <ArtifactFilePreview taskId={taskId} artifact={art} />
        </div>
      )}
      {fullView && (
        <ArtifactLightbox taskId={taskId} artifact={art} onClose={() => setFullView(false)} />
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
