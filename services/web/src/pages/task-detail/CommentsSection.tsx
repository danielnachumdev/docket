import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  api,
  type Artifact,
  type CommentRef,
  type MentionableUser,
  type Task,
  type TaskComment,
  type TaskShare,
} from '../../api'
import { useAuth } from '../../auth'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { useConfirm } from '../../lib/dialogs'
import { formatDateTime, formatRelative } from '../../lib/format'
import { useAction } from '../../lib/useAction'

type TriggerKind = '@' | '#' | '&' | '~'

type Props = {
  taskId: string
  artifacts: Artifact[]
  tasks: Task[]
  shares: TaskShare[]
  canComment: boolean
  onChanged: () => Promise<void>
}

function highlightComment(commentId: number) {
  const el = document.getElementById(`comment-${commentId}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('comment-flash')
  window.setTimeout(() => el.classList.remove('comment-flash'), 1600)
}

function highlightArtifact(artifactId: number) {
  const el = document.getElementById(`artifact-${artifactId}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('comment-flash')
  window.setTimeout(() => el.classList.remove('comment-flash'), 1600)
}

function highlightShare(userId: number) {
  const el = document.getElementById(`share-user-${userId}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('comment-flash')
  window.setTimeout(() => el.classList.remove('comment-flash'), 1600)
}

function renderBody(
  body: string,
  refs: CommentRef[],
  onRefClick: (ref: CommentRef) => void,
) {
  if (!refs.length) return body
  const ordered = [...refs].sort((a, b) => a.start - b.start)
  const parts: ReactNode[] = []
  let cursor = 0
  ordered.forEach((ref, index) => {
    if (ref.start < cursor || ref.end > body.length) return
    if (ref.start > cursor) parts.push(body.slice(cursor, ref.start))
    const label =
      ref.kind === 'user'
        ? `@${ref.display_name ?? ref.label ?? ref.raw.slice(1)}`
        : ref.kind === 'task'
          ? `#${ref.number ?? ref.task_id ?? ref.raw.slice(1)}`
          : ref.kind === 'artifact'
            ? `&${ref.label ?? ref.artifact_id ?? ref.raw.slice(1)}`
            : `~${ref.comment_id ?? ref.raw.slice(1)}`
    parts.push(
      <button
        key={`${ref.kind}-${index}-${ref.start}`}
        type="button"
        className={`comment-chip kind-${ref.kind}`}
        onClick={() => onRefClick(ref)}
      >
        {label}
      </button>,
    )
    cursor = ref.end
  })
  if (cursor < body.length) parts.push(body.slice(cursor))
  return parts
}

export function CommentsSection({
  taskId,
  artifacts,
  tasks,
  shares,
  canComment,
  onChanged,
}: Props) {
  const { t } = useTranslation(['tasks', 'common'])
  const confirm = useConfirm()
  const { status } = useAuth()
  const navigate = useNavigate()
  const meId = status?.user?.id
  const [comments, setComments] = useState<TaskComment[]>([])
  const [mentionables, setMentionables] = useState<MentionableUser[]>([])
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [trigger, setTrigger] = useState<{ kind: TriggerKind; start: number; query: string } | null>(
    null,
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { busy, error, setError, run } = useAction()

  const reload = useCallback(async () => {
    const [rows, people] = await Promise.all([
      api.listComments(taskId),
      api.listMentionables(taskId),
    ])
    setComments(rows)
    setMentionables(people)
  }, [taskId])

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message))
  }, [reload, setError])

  const pickerItems = useMemo(() => {
    if (!trigger) return []
    const q = trigger.query.toLowerCase()
    if (trigger.kind === '@') {
      return mentionables
        .filter(
          (u) =>
            u.display_name.toLowerCase().includes(q) ||
            (u.email ?? '').toLowerCase().includes(q) ||
            u.handle.toLowerCase().includes(q),
        )
        .slice(0, 8)
        .map((u) => ({
          key: `u-${u.user_id}`,
          label: u.display_name,
          detail: u.email ?? u.handle,
          insert: `@${u.handle}`,
        }))
    }
    if (trigger.kind === '#') {
      return tasks
        .filter(
          (t) =>
            t.id !== taskId &&
            (t.title.toLowerCase().includes(q) ||
              t.id.toLowerCase().includes(q) ||
              String(t.number).includes(q)),
        )
        .slice(0, 8)
        .map((t) => ({
          key: `t-${t.id}`,
          label: `#${t.number} ${t.title}`,
          detail: t.id,
          insert: `#${t.id}`,
        }))
    }
    if (trigger.kind === '&') {
      return artifacts
        .filter((a) => a.title.toLowerCase().includes(q) || String(a.id).includes(q))
        .slice(0, 8)
        .map((a) => ({
          key: `a-${a.id}`,
          label: a.title,
          detail: String(a.id),
          insert: `&${a.id}`,
        }))
    }
    return comments
      .filter(
        (c) =>
          String(c.id).includes(q) ||
          c.body.toLowerCase().includes(q) ||
          c.author_display_name.toLowerCase().includes(q),
      )
      .slice(0, 8)
      .map((c) => ({
        key: `c-${c.id}`,
        label: `~${c.id} ${c.author_display_name}`,
        detail: c.body.slice(0, 60),
        insert: `~${c.id}`,
      }))
  }, [artifacts, comments, mentionables, taskId, tasks, trigger])

  function detectTrigger(value: string, caret: number) {
    const before = value.slice(0, caret)
    const match = before.match(/([@#&~])([^\s@#&~]*)$/)
    if (!match || match.index == null) {
      setTrigger(null)
      return
    }
    setTrigger({
      kind: match[1] as TriggerKind,
      start: match.index,
      query: match[2] ?? '',
    })
  }

  function insertToken(token: string) {
    const el = textareaRef.current
    if (!el || !trigger) {
      setBody((prev) => `${prev}${token} `)
      return
    }
    const caret = el.selectionStart
    const next = `${body.slice(0, trigger.start)}${token} ${body.slice(caret)}`
    setBody(next)
    setTrigger(null)
    requestAnimationFrame(() => {
      const pos = trigger.start + token.length + 1
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function onRefClick(ref: CommentRef) {
    if (ref.kind === 'task' && ref.task_id) {
      void navigate(`/tasks/${ref.task_id}`)
      return
    }
    if (ref.kind === 'artifact' && ref.artifact_id != null) {
      highlightArtifact(ref.artifact_id)
      return
    }
    if (ref.kind === 'comment' && ref.comment_id != null) {
      highlightComment(ref.comment_id)
      return
    }
    if (ref.kind === 'user' && ref.user_id != null) {
      const shared = shares.some((s) => s.user_id === ref.user_id)
      if (shared) highlightShare(ref.user_id)
      else if (ref.email) window.location.href = `mailto:${ref.email}`
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || !canComment) return
    void run(async () => {
      if (editingId != null) {
        await api.updateComment(taskId, editingId, body.trim())
      } else {
        await api.addComment(taskId, body.trim())
      }
      setBody('')
      setEditingId(null)
      setTrigger(null)
      await reload()
      await onChanged()
      window.dispatchEvent(new Event('docket:notifications'))
    }, editingId != null ? t('commentUpdateFailed') : t('commentAddFailed'))
  }

  function startEdit(comment: TaskComment) {
    setEditingId(comment.id)
    setBody(comment.body)
    setTrigger(null)
    textareaRef.current?.focus()
  }

  return (
    <Section icon="message" title={t('comments')} count={comments.length}>
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {comments.length === 0 ? (
        <p className="muted small">{t('commentsEmpty')}</p>
      ) : (
        <ul className="comment-thread">
          {comments.map((c) => (
            <li key={c.id} id={`comment-${c.id}`} className="comment-item">
              <div className="comment-meta">
                <strong>{c.author_display_name}</strong>
                <span className="muted small" title={formatDateTime(c.created_at)}>
                  {formatRelative(c.created_at)}
                  {c.updated_at !== c.created_at ? ` · ${t('commentEdited')}` : ''}
                </span>
              </div>
              <div className="comment-body">{renderBody(c.body, c.refs ?? [], onRefClick)}</div>
              {(c.can_edit || c.author_user_id === meId) && canComment && (
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={busy}
                    onClick={() => startEdit(c)}
                  >
                    {t('commentEdit')}
                  </button>
                  <button
                    type="button"
                    className="btn ghost small danger"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('commentDeleteTitle'),
                        description: t('commentDeleteConfirm'),
                        confirmLabel: t('common:delete'),
                        danger: true,
                      })
                      if (!ok) return
                      void run(async () => {
                        await api.deleteComment(taskId, c.id)
                        if (editingId === c.id) {
                          setEditingId(null)
                          setBody('')
                        }
                        await reload()
                        await onChanged()
                      }, t('commentDeleteFailed'))
                    }}
                  >
                    {t('commentDelete')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form className="comment-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="sr-only">
              {editingId != null ? t('commentEdit') : t('commentSubmit')}
            </span>
            <textarea
              ref={textareaRef}
              rows={3}
              value={body}
              onChange={(e) => {
                const value = e.target.value
                setBody(value)
                detectTrigger(value, e.target.selectionStart)
              }}
              onKeyUp={(e) => detectTrigger(body, e.currentTarget.selectionStart)}
              onClick={(e) => detectTrigger(body, e.currentTarget.selectionStart)}
              placeholder={t('commentPlaceholder')}
              disabled={busy}
            />
          </label>
          {trigger && pickerItems.length > 0 && (
            <ul className="comment-picker" role="listbox" aria-label={t('commentPicker')}>
              {pickerItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className="comment-picker-item"
                    onClick={() => insertToken(item.insert)}
                  >
                    <span>{item.label}</span>
                    <span className="muted small">{item.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="inline-form">
            <button type="submit" className="btn" disabled={busy || !body.trim()}>
              <Icon name="plus" />
              {editingId != null ? t('commentSave') : t('commentSubmit')}
            </button>
            {editingId != null && (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => {
                  setEditingId(null)
                  setBody('')
                  setTrigger(null)
                }}
              >
                {t('commentCancel')}
              </button>
            )}
          </div>
          <p className="muted small">
            {t('commentShorthandHint')} <code>@</code> <code>#</code> <code>&amp;</code>{' '}
            <code>~</code>
          </p>
        </form>
      ) : (
        <p className="muted small">{t('commentReadOnly')}</p>
      )}
    </Section>
  )
}
