import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Artifact, CommentRef, TaskComment } from '../../api'
import { getArtifactPreviewKind } from '../../lib/artifactMedia'
import { useArtifactObjectUrl } from '../../lib/useArtifactObjectUrl'
import { ArtifactFilePreview } from './ArtifactFilePreview'
import { ArtifactFullView } from './ArtifactFullView'
import {
  artifactAnchorId,
  commentAnchorId,
  highlightArtifact,
  highlightComment,
  highlightShare,
  shareUserAnchorId,
} from './commentAnchors'
import './CommentRefChip.css'
import './CommentsSection.css'

const HOVER_MS = 280

type Props = {
  taskId: string
  commentRef: CommentRef
  artifacts: Artifact[]
  commentsById: Map<number, TaskComment>
}

export function refChipLabel(ref: CommentRef) {
  if (ref.kind === 'user') return `@${ref.display_name ?? ref.label ?? ref.raw.slice(1)}`
  if (ref.kind === 'task') return `#${ref.number ?? ref.task_id ?? ref.raw.slice(1)}`
  if (ref.kind === 'artifact') return `&${ref.label ?? ref.artifact_id ?? ref.raw.slice(1)}`
  return `~${ref.comment_id ?? ref.raw.slice(1)}`
}

function artifactHref(taskId: string, artifactId: number) {
  return `/tasks/${taskId}#${artifactAnchorId(artifactId)}`
}

function commentHref(taskId: string, commentId: number) {
  return `/tasks/${taskId}#${commentAnchorId(commentId)}`
}

function shareHref(taskId: string, userId: number) {
  return `/tasks/${taskId}#${shareUserAnchorId(userId)}`
}

function ArtifactTooltipBody({
  taskId,
  artifact,
}: {
  taskId: string
  artifact: Artifact
}) {
  const kind = getArtifactPreviewKind(artifact)
  const { src, error } = useArtifactObjectUrl({
    taskId,
    artifactId: artifact.id,
    title: artifact.title,
    contentType: artifact.content_type,
  })
  if (kind === 'image' && src) {
    return <img className="comment-ref-preview-img" src={src} alt={artifact.title} />
  }
  return (
    <div className="comment-ref-preview-meta">
      <strong>{artifact.title}</strong>
      <span className="muted small">{artifact.content_type || artifact.kind}</span>
      {error && <span className="muted small">{error}</span>}
    </div>
  )
}

export function CommentRefChip({ taskId, commentRef, artifacts, commentsById }: Props) {
  const { t } = useTranslation('tasks')
  const navigate = useNavigate()
  const [hover, setHover] = useState(false)
  const [fullView, setFullView] = useState(false)
  const timer = useRef<number | null>(null)
  const label = refChipLabel(commentRef)
  const artifact =
    commentRef.kind === 'artifact' && commentRef.artifact_id != null
      ? artifacts.find((row) => row.id === commentRef.artifact_id) ?? null
      : null
  const linkedComment =
    commentRef.kind === 'comment' && commentRef.comment_id != null
      ? commentsById.get(commentRef.comment_id) ?? null
      : null

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    }
  }, [])

  function openHover() {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHover(true), HOVER_MS)
  }

  function closeHover() {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
    setHover(false)
  }

  function onActivate(e: MouseEvent) {
    e.preventDefault()
    if (commentRef.kind === 'artifact' && commentRef.artifact_id != null) {
      const href = artifactHref(taskId, commentRef.artifact_id)
      window.history.replaceState(null, '', href)
      if (artifact) {
        setFullView(true)
      } else {
        highlightArtifact(commentRef.artifact_id)
      }
      return
    }
    if (commentRef.kind === 'task' && commentRef.task_id) {
      void navigate(`/tasks/${commentRef.task_id}`)
      return
    }
    if (commentRef.kind === 'comment' && commentRef.comment_id != null) {
      void navigate(commentHref(taskId, commentRef.comment_id))
      highlightComment(commentRef.comment_id)
      return
    }
    if (commentRef.kind === 'user' && commentRef.user_id != null) {
      void navigate(shareHref(taskId, commentRef.user_id))
      highlightShare(commentRef.user_id)
      return
    }
  }

  let preview: ReactNode = null
  if (hover) {
    if (commentRef.kind === 'artifact' && artifact) {
      preview = <ArtifactTooltipBody taskId={taskId} artifact={artifact} />
    } else if (commentRef.kind === 'task') {
      preview = (
        <div className="comment-ref-preview-meta">
          <strong>
            #{commentRef.number ?? '—'} {commentRef.title ?? commentRef.label ?? ''}
          </strong>
          <span className="muted small">{t('refPreview.openTask')}</span>
        </div>
      )
    } else if (commentRef.kind === 'user') {
      preview = (
        <div className="comment-ref-preview-meta">
          <strong>{commentRef.display_name ?? commentRef.label ?? label}</strong>
          {commentRef.email && <span className="muted small">{commentRef.email}</span>}
          <span className="muted small">{t('refPreview.openShare')}</span>
        </div>
      )
    } else if (commentRef.kind === 'comment') {
      preview = (
        <div className="comment-ref-preview-meta">
          <strong>{t('refPreview.comment', { id: commentRef.comment_id })}</strong>
          {linkedComment?.body?.trim() ? (
            <p className="comment-ref-preview-snippet">{linkedComment.body.trim()}</p>
          ) : (
            <span className="muted small">{t('refPreview.openComment')}</span>
          )}
        </div>
      )
    }
  }

  const href =
    commentRef.kind === 'task' && commentRef.task_id
      ? `/tasks/${commentRef.task_id}`
      : commentRef.kind === 'comment' && commentRef.comment_id != null
        ? commentHref(taskId, commentRef.comment_id)
        : commentRef.kind === 'user' && commentRef.user_id != null
          ? shareHref(taskId, commentRef.user_id)
          : commentRef.kind === 'artifact' && commentRef.artifact_id != null
            ? artifactHref(taskId, commentRef.artifact_id)
            : undefined

  return (
    <span
      className="comment-ref-chip-wrap"
      onMouseEnter={openHover}
      onMouseLeave={closeHover}
      onFocus={openHover}
      onBlur={closeHover}
    >
      <a
        href={href}
        className={`comment-chip kind-${commentRef.kind}`}
        aria-label={t('refPreview.activate', { label })}
        onClick={onActivate}
      >
        {label}
      </a>
      {hover && preview && (
        <div className="comment-ref-preview" role="tooltip">
          {preview}
        </div>
      )}
      {fullView && artifact && (
        <ArtifactFullView
          title={artifact.title}
          onClose={() => setFullView(false)}
          bodyClassName="artifact-fullview-media"
        >
          <ArtifactFilePreview taskId={taskId} artifact={artifact} />
        </ArtifactFullView>
      )}
    </span>
  )
}
