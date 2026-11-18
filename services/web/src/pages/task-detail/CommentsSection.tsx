import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  api,
  type Artifact,
  type MentionableUser,
  type Task,
  type TaskComment,
  type TaskShare,
} from '../../api'
import { useAuth } from '../../auth'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { MarkdownView, MarkdownWithRefs } from '../../components/MarkdownView'
import { Section } from '../../components/Section'
import { Skeleton } from '../../components/Skeleton'
import { UserBidiText } from '../../components/UserBidiText'
import { userBidiAttrs } from '../../lib/bidi'
import { contactPickerLabel, mentionInsertToken } from '../../lib/contactLabel'
import { useConfirm } from '../../lib/dialogs'
import { formatDateTime, formatRelative } from '../../lib/format'
import { useAction } from '../../lib/useAction'
import { CommentAttachmentList } from './CommentAttachmentList'
import { CommentRefChip } from './CommentRefChip'
import {
  MentionShareDialog,
  type MentionShareChoice,
} from './MentionShareDialog'
import './CommentsSection.css'

type TriggerKind = '@' | '#' | '&' | '~'

type PendingFile = { key: string; file: File }

type Props = {
  taskId: string
  artifacts: Artifact[]
  tasks: Task[]
  shares: TaskShare[]
  ownerUserId: number
  canComment: boolean
  /** Attach files/images on new comments (requires artifacts:write). */
  canAttach?: boolean
  /** Owner/editor can offer share-on-mention; commentors post without sharing. */
  canManageShares?: boolean
  /** When true, only the composer is shown (feed lives in ActivitySection). */
  composerOnly?: boolean
  onChanged: () => Promise<void>
}

function mentionedWithoutAccess(
  text: string,
  mentionables: MentionableUser[],
  shares: TaskShare[],
  ownerUserId: number,
): MentionableUser[] {
  const sharedIds = new Set(shares.map((s) => s.user_id))
  sharedIds.add(ownerUserId)
  const found: MentionableUser[] = []
  const seen = new Set<number>()
  for (const user of mentionables) {
    if (sharedIds.has(user.user_id) || seen.has(user.user_id)) continue
    const handle = user.handle.toLowerCase()
    const email = (user.email ?? '').toLowerCase()
    const nick = (user.nickname ?? '').toLowerCase()
    const patterns = [`@${handle}`]
    if (email) patterns.push(`@${email}`)
    if (nick) patterns.push(`@${nick}`)
    const hit = patterns.some((p) => {
      const re = new RegExp(
        `(^|[^\\w])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\w.-])`,
        'i',
      )
      return re.test(text)
    })
    if (hit) {
      seen.add(user.user_id)
      found.push(user)
    }
  }
  return found
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

export function CommentsSection({
  taskId,
  artifacts,
  tasks,
  shares,
  ownerUserId,
  canComment,
  canAttach = false,
  canManageShares = false,
  composerOnly = false,
  onChanged,
}: Props) {
  const { t } = useTranslation(['tasks', 'common', 'detail'])
  const confirm = useConfirm()
  const { status } = useAuth()
  const meId = status?.user?.id
  /** null = comments feed not yet loaded (composer-only mode ignores this for empty UI). */
  const [comments, setComments] = useState<TaskComment[] | null>(null)
  const [mentionables, setMentionables] = useState<MentionableUser[]>([])
  const [body, setBody] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [trigger, setTrigger] = useState<{ kind: TriggerKind; start: number; query: string } | null>(
    null,
  )
  const [pendingMentions, setPendingMentions] = useState<MentionableUser[] | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { busy, error, setError, run } = useAction()
  const canPost = Boolean(body.trim() || (editingId == null && pendingFiles.length > 0))
  const showAttach = canAttach && editingId == null

  const reload = useCallback(async () => {
    const [rows, people] = await Promise.all([
      api.listComments(taskId),
      api.listMentionables(taskId),
    ])
    setComments(rows)
    setMentionables(people)
  }, [taskId])

  useEffect(() => {
    setComments(null)
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
            (u.nickname ?? '').toLowerCase().includes(q) ||
            u.handle.toLowerCase().includes(q),
        )
        .slice(0, 8)
        .map((u) => ({
          key: `u-${u.user_id}`,
          label: contactPickerLabel(u),
          detail: u.nickname ? u.display_name : (u.email ?? u.handle),
          insert: mentionInsertToken(u),
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
    return (comments ?? [])
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

  const commentsById = useMemo(() => {
    const map = new Map<number, TaskComment>()
    for (const row of comments ?? []) map.set(row.id, row)
    return map
  }, [comments])

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list?.length) return
    const next: PendingFile[] = Array.from(list).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
    }))
    setPendingFiles((prev) => [...prev, ...next])
    e.target.value = ''
  }

  async function publishComment() {
    if (editingId != null) {
      await api.updateComment(taskId, editingId, body.trim())
    } else {
      const attachments = await Promise.all(
        pendingFiles.map(async ({ file }) => ({
          kind: 'file' as const,
          title: file.name,
          content_base64: await fileToBase64(file),
          content_type: file.type || 'application/octet-stream',
        })),
      )
      await api.addComment(taskId, body.trim(), attachments)
    }
    setBody('')
    setPendingFiles([])
    setEditingId(null)
    setTrigger(null)
    setPendingMentions(null)
    await reload()
    await onChanged()
    window.dispatchEvent(new Event('waymark:notifications'))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canComment || !canPost) return
    if (editingId == null && canManageShares) {
      const needsShare = mentionedWithoutAccess(
        body,
        mentionables,
        shares,
        ownerUserId,
      ).filter((u) => u.user_id !== meId)
      if (needsShare.length > 0) {
        setPendingMentions(needsShare)
        return
      }
    }
    void run(
      () => publishComment(),
      editingId != null ? t('commentUpdateFailed') : t('commentAddFailed'),
    )
  }

  function onMentionShareConfirm(choices: Record<number, MentionShareChoice>) {
    void run(async () => {
      for (const [userIdRaw, choice] of Object.entries(choices)) {
        if (choice === 'skip') continue
        await api.shareTask(taskId, {
          user_id: Number(userIdRaw),
          role: choice,
        })
      }
      await publishComment()
    }, t('commentAddFailed'))
  }

  function startEdit(comment: TaskComment) {
    setEditingId(comment.id)
    setBody(comment.body)
    setPendingFiles([])
    setTrigger(null)
    textareaRef.current?.focus()
  }

  if (composerOnly && !canComment) return null

  return (
    <Section
      icon="message"
      title={composerOnly ? t('commentSubmit') : t('comments')}
      count={composerOnly || comments == null ? undefined : comments.length}
      variant={composerOnly ? 'plain' : 'card'}
    >
      {pendingMentions && (
        <MentionShareDialog
          users={pendingMentions}
          busy={busy}
          onCancel={() => setPendingMentions(null)}
          onConfirm={onMentionShareConfirm}
        />
      )}
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {!composerOnly &&
        (comments == null ? (
          !error && <Skeleton rows={3} leading="avatar" />
        ) : comments.length === 0 ? (
          <p className="muted small">{t('commentsEmpty')}</p>
        ) : (
          <ul className="comment-thread">
            {comments.map((c) => (
              <li key={c.id} id={`comment-${c.id}`} className="comment-item">
                <div className="comment-meta">
                  <strong>{c.author_label || c.author_display_name}</strong>
                  <span className="muted small" title={formatDateTime(c.created_at)}>
                    {formatRelative(c.created_at)}
                    {c.updated_at !== c.created_at ? ` · ${t('commentEdited')}` : ''}
                  </span>
                </div>
                {(c.refs ?? []).length > 0 ? (
                  <MarkdownWithRefs
                    source={c.body}
                    refs={c.refs ?? []}
                    className="comment-body"
                    renderRef={(ref, key) => (
                      <CommentRefChip
                        key={key}
                        taskId={taskId}
                        commentRef={ref}
                        artifacts={artifacts}
                        commentsById={commentsById}
                      />
                    )}
                  />
                ) : (
                  <MarkdownView source={c.body} className="comment-body" />
                )}
                {(c.attachments?.length ?? 0) > 0 && (
                  <CommentAttachmentList taskId={taskId} attachments={c.attachments} />
                )}
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
        ))}

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
              placeholder={
                showAttach ? t('commentPlaceholderWithAttach') : t('commentPlaceholder')
              }
              disabled={busy}
              {...userBidiAttrs(body)}
            />
          </label>
          {showAttach && pendingFiles.length > 0 && (
            <ul className="comment-pending-files" aria-label={t('commentPendingFiles')}>
              {pendingFiles.map((item) => (
                <li key={item.key} className="comment-pending-file">
                  <Icon name="paperclip" size={12} />
                  <span>{item.file.name}</span>
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={busy}
                    onClick={() =>
                      setPendingFiles((prev) => prev.filter((row) => row.key !== item.key))
                    }
                  >
                    {t('common:remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {trigger && pickerItems.length > 0 && (
            <ul className="comment-picker" role="listbox" aria-label={t('commentPicker')}>
              {pickerItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className="comment-picker-item"
                    onClick={() => insertToken(item.insert)}
                  >
                    <UserBidiText text={item.label} />
                    <UserBidiText text={item.detail} className="muted small" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="inline-form comment-form-actions">
            {showAttach && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={onPickFiles}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="paperclip" />
                  {t('commentAttach')}
                </button>
              </>
            )}
            <button type="submit" className="btn primary small" disabled={busy || !canPost}>
              <Icon name="plus" />
              {editingId != null ? t('commentSave') : t('commentSubmit')}
            </button>
            {editingId != null && (
              <button
                type="button"
                className="btn ghost small"
                disabled={busy}
                onClick={() => {
                  setEditingId(null)
                  setBody('')
                  setPendingFiles([])
                  setTrigger(null)
                }}
              >
                {t('commentCancel')}
              </button>
            )}
          </div>
          <p className="muted small comment-form-hint hide-narrow">
            {showAttach ? `${t('commentAttachHint')} ` : ''}
            {t('commentMarkdownHint')}{' '}
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
