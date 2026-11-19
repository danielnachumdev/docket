import { useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Artifact, CommentRef, TaskComment } from '../../api'
import { HoverCard } from '../../components/HoverCard'
import { Icon } from '../../components/Icon'
import { formatActivityTaskChipLabel, isInaccessibleTaskRef } from '../../lib/activityTaskRef'
import { ArtifactHoverPreview } from './ArtifactHoverPreview'
import { externalLinkUrl, isViewableArtifact } from '../../lib/artifactMedia'
import { useHoverCard } from '../../lib/useHoverCard'
import { ArtifactLightbox } from './ArtifactLightbox'
import { InaccessibleRefChip } from './InaccessibleRefChip'
import {
  artifactAnchorId,
  commentAnchorId,
  highlightArtifact,
  highlightComment,
  highlightShare,
  shareUserAnchorId,
} from './commentAnchors'
import './CommentRefChip.css'

type Props = {
  taskId: string
  commentRef: CommentRef
  artifacts: Artifact[]
  commentsById: Map<number, TaskComment>
  /** When true, task chips include the resolved title beside #N (activity link events). */
  showTitle?: boolean
}

function refChipLabel(ref: CommentRef, showTitle = false) {
  if (ref.kind === 'user') return `@${ref.display_name ?? ref.label ?? ref.raw.slice(1)}`
  if (ref.kind === 'task') {
    return formatActivityTaskChipLabel({
      number: ref.number,
      title: ref.title,
      publicId: ref.task_id,
      showTitle,
    })
  }
  if (ref.kind === 'artifact') return `&${ref.label ?? ref.artifact_id ?? ref.raw.slice(1)}`
  return `~${ref.comment_id ?? ref.raw.slice(1)}`
}

function MetaCard({
  icon,
  title,
  detail,
  hint,
}: {
  icon: 'tasks' | 'user' | 'message'
  title: ReactNode
  detail?: ReactNode
  hint: string
}) {
  return (
    <>
      <div className="ref-meta">
        <Icon name={icon} size={14} />
        <div className="ref-meta-copy">
          <strong className="ref-meta-title">{title}</strong>
          {detail}
        </div>
      </div>
      <p className="hover-card-hint muted">{hint}</p>
    </>
  )
}

export function CommentRefChip({
  taskId,
  commentRef,
  artifacts,
  commentsById,
  showTitle = false,
}: Props) {
  const { t } = useTranslation('tasks')
  const navigate = useNavigate()
  const [fullView, setFullView] = useState(false)
  const label = refChipLabel(commentRef, showTitle)
  const privateTask = isInaccessibleTaskRef(commentRef)
  const guestShare = taskId.startsWith('public:')
  const artifact =
    commentRef.kind === 'artifact' && commentRef.artifact_id != null
      ? (artifacts.find((row) => row.id === commentRef.artifact_id) ?? null)
      : null
  const linkedComment =
    commentRef.kind === 'comment' && commentRef.comment_id != null
      ? (commentsById.get(commentRef.comment_id) ?? null)
      : null
  const linkUrl = artifact ? externalLinkUrl(artifact) : null
  const viewable = artifact ? isViewableArtifact(artifact) : false

  const hasCard =
    !privateTask &&
    (commentRef.kind === 'artifact'
      ? viewable
      : commentRef.kind === 'comment'
        ? Boolean(linkedComment?.body?.trim())
        : commentRef.kind === 'task'
          ? Boolean(commentRef.task_id) && !guestShare
          : commentRef.kind === 'user'
            ? commentRef.user_id != null
            : false)
  const hover = useHoverCard({ enabled: hasCard && !fullView })

  if (privateTask) {
    return <InaccessibleRefChip />
  }

  const href =
    linkUrl ??
    (commentRef.kind === 'task' && commentRef.task_id && !guestShare
      ? `/tasks/${commentRef.task_id}`
      : commentRef.kind === 'comment' && commentRef.comment_id != null
        ? `#${commentAnchorId(commentRef.comment_id)}`
        : commentRef.kind === 'user' && commentRef.user_id != null
          ? `#${shareUserAnchorId(commentRef.user_id)}`
          : artifact
            ? `#${artifactAnchorId(artifact.id)}`
            : undefined)

  function onActivate(e: MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle new-tab / external opens natively.
    if (linkUrl || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    hover.close()
    if (artifact) {
      if (viewable) setFullView(true)
      else highlightArtifact(artifact.id)
      return
    }
    if (commentRef.kind === 'task' && commentRef.task_id) {
      if (guestShare) return
      void navigate(`/tasks/${commentRef.task_id}`)
      return
    }
    if (commentRef.kind === 'comment' && commentRef.comment_id != null) {
      window.history.replaceState(null, '', `#${commentAnchorId(commentRef.comment_id)}`)
      highlightComment(commentRef.comment_id)
      return
    }
    if (commentRef.kind === 'user' && commentRef.user_id != null) {
      highlightShare(commentRef.user_id)
    }
  }

  if (!href) {
    return <span className={`comment-chip kind-${commentRef.kind} is-missing`}>{label}</span>
  }

  return (
    <>
      <a
        {...hover.anchorProps}
        href={href}
        className={`comment-chip kind-${commentRef.kind}`}
        aria-label={t('refPreview.activate', { label })}
        aria-haspopup={hasCard ? 'dialog' : undefined}
        target={linkUrl ? '_blank' : undefined}
        rel={linkUrl ? 'noopener noreferrer' : undefined}
        onClick={onActivate}
      >
        {linkUrl && <Icon name="external" size={11} />}
        {label}
      </a>
      {hover.open && (
        <HoverCard
          anchor={hover.anchor}
          cardProps={hover.cardProps}
          label={label}
          className={artifact ? 'ref-card ref-card-media' : 'ref-card'}
        >
          {artifact ? (
            <ArtifactHoverPreview taskId={taskId} artifact={artifact} />
          ) : commentRef.kind === 'task' ? (
            <MetaCard
              icon="tasks"
              title={`#${commentRef.number ?? '—'} ${commentRef.title ?? commentRef.label ?? ''}`}
              hint={t('refPreview.openTask')}
            />
          ) : commentRef.kind === 'user' ? (
            <MetaCard
              icon="user"
              title={commentRef.display_name ?? commentRef.label ?? label}
              detail={commentRef.email && <span className="muted small">{commentRef.email}</span>}
              hint={t('refPreview.openShare')}
            />
          ) : linkedComment ? (
            <MetaCard
              icon="message"
              title={t('refPreview.commentBy', {
                author: linkedComment.author_label || linkedComment.author_display_name,
                id: linkedComment.id,
              })}
              detail={<p className="ref-meta-snippet">{linkedComment.body.trim()}</p>}
              hint={t('refPreview.openComment')}
            />
          ) : null}
        </HoverCard>
      )}
      {fullView && artifact && (
        <ArtifactLightbox taskId={taskId} artifact={artifact} onClose={() => setFullView(false)} />
      )}
    </>
  )
}
