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
const TEXT_SNIPPET = 480

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

function isExternalLinkArtifact(artifact: Artifact) {
  return artifact.kind === 'link' && Boolean(artifact.content_text?.trim())
}

function canHoverPreviewArtifact(artifact: Artifact): boolean {
  if (isExternalLinkArtifact(artifact)) return false
  if (artifact.kind === 'text' || artifact.kind === 'json') {
    return Boolean(artifact.content_text?.trim())
  }
  if (artifact.kind !== 'file' || !artifact.storage_key) return false
  const kind = getArtifactPreviewKind(artifact)
  return (
    kind === 'image' ||
    kind === 'pdf' ||
    kind === 'audio' ||
    kind === 'video' ||
    kind === 'markdown' ||
    kind === 'text'
  )
}

function ArtifactTooltipBody({
  taskId,
  artifact,
}: {
  taskId: string
  artifact: Artifact
}) {
  const kind = getArtifactPreviewKind(artifact)
  const inlineText =
    (artifact.kind === 'text' || artifact.kind === 'json') && artifact.content_text
      ? artifact.content_text
      : null
  const needsBlob = !inlineText && artifact.kind === 'file' && Boolean(artifact.storage_key)
  const { src, blob, error } = useArtifactObjectUrl({
    taskId,
    artifactId: artifact.id,
    title: artifact.title,
    contentType: artifact.content_type,
  })
  const [text, setText] = useState<string | null>(inlineText)

  useEffect(() => {
    if (inlineText) {
      setText(inlineText)
      return
    }
    if (!blob || (kind !== 'text' && kind !== 'markdown')) {
      setText(null)
      return
    }
    let cancelled = false
    void blob.text().then((value) => {
      if (!cancelled) setText(value)
    })
    return () => {
      cancelled = true
    }
  }, [blob, inlineText, kind])

  let body: ReactNode = null
  if (!error) {
    if (inlineText) {
      body = (
        <pre className="comment-ref-preview-text">
          {inlineText.slice(0, TEXT_SNIPPET)}
          {inlineText.length > TEXT_SNIPPET ? '…' : ''}
        </pre>
      )
    } else if (needsBlob && src) {
      if (kind === 'image') {
        body = <img className="comment-ref-preview-img" src={src} alt={artifact.title} />
      } else if (kind === 'audio') {
        body = (
          <audio
            className="comment-ref-preview-audio"
            controls
            preload="metadata"
            src={src}
            onClick={(e) => e.stopPropagation()}
          />
        )
      } else if (kind === 'video') {
        body = (
          <video
            className="comment-ref-preview-video"
            controls
            preload="metadata"
            src={src}
            onClick={(e) => e.stopPropagation()}
          />
        )
      } else if (kind === 'pdf') {
        body = <iframe className="comment-ref-preview-doc" title={artifact.title} src={src} />
      } else if ((kind === 'text' || kind === 'markdown') && text) {
        body = (
          <pre className="comment-ref-preview-text">
            {text.slice(0, TEXT_SNIPPET)}
            {text.length > TEXT_SNIPPET ? '…' : ''}
          </pre>
        )
      }
    }
  }
  if (!body) return null
  return (
    <div className="comment-ref-preview" role="tooltip">
      {body}
    </div>
  )
}

function MetaTooltip({ children }: { children: ReactNode }) {
  return <div className="comment-ref-preview-meta">{children}</div>
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
  const linkUrl =
    artifact && isExternalLinkArtifact(artifact) ? artifact.content_text!.trim() : null
  const allowArtifactHover = artifact ? canHoverPreviewArtifact(artifact) : false

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
    if (commentRef.kind === 'artifact' && linkUrl) {
      // Let the browser open the external URL (target=_blank on the anchor).
      return
    }
    e.preventDefault()
    if (commentRef.kind === 'artifact' && commentRef.artifact_id != null) {
      const href = artifactHref(taskId, commentRef.artifact_id)
      window.history.replaceState(null, '', href)
      if (artifact && !isExternalLinkArtifact(artifact)) {
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

  const href = linkUrl
    ? linkUrl
    : commentRef.kind === 'task' && commentRef.task_id
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
        target={linkUrl ? '_blank' : undefined}
        rel={linkUrl ? 'noopener noreferrer' : undefined}
        onClick={onActivate}
      >
        {label}
      </a>
      {hover && allowArtifactHover && artifact && (
        <ArtifactTooltipBody taskId={taskId} artifact={artifact} />
      )}
      {hover && commentRef.kind === 'task' && (
        <div className="comment-ref-preview" role="tooltip">
          <MetaTooltip>
            <strong>
              #{commentRef.number ?? '—'} {commentRef.title ?? commentRef.label ?? ''}
            </strong>
            <span className="muted small">{t('refPreview.openTask')}</span>
          </MetaTooltip>
        </div>
      )}
      {hover && commentRef.kind === 'user' && (
        <div className="comment-ref-preview" role="tooltip">
          <MetaTooltip>
            <strong>{commentRef.display_name ?? commentRef.label ?? label}</strong>
            {commentRef.email && <span className="muted small">{commentRef.email}</span>}
            <span className="muted small">{t('refPreview.openShare')}</span>
          </MetaTooltip>
        </div>
      )}
      {hover && commentRef.kind === 'comment' && linkedComment?.body?.trim() && (
        <div className="comment-ref-preview" role="tooltip">
          <MetaTooltip>
            <strong>{t('refPreview.comment', { id: commentRef.comment_id })}</strong>
            <p className="comment-ref-preview-snippet">{linkedComment.body.trim()}</p>
          </MetaTooltip>
        </div>
      )}
      {fullView && artifact && !isExternalLinkArtifact(artifact) && (
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
