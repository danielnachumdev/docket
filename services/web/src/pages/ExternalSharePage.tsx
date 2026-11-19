import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import {
  api,
  type Artifact,
  type ExternalShareDetail,
  type Task,
  type TaskComment,
  type TaskEvent,
  type TaskLink,
} from '../api'
import { DueBadge, PriorityBadge, StatusBadge } from '../components/Badges'
import { Logo } from '../components/AppLayout'
import { Alert, Spinner } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { MarkdownView } from '../components/MarkdownView'
import { Section } from '../components/Section'
import { UserBidiText } from '../components/UserBidiText'
import { formatDateTime, formatRelative, humanize } from '../lib/format'
import {
  publicShareBlobScope,
  retainArtifactBlobScope,
} from '../lib/artifactObjectUrlCache'
import { usePrefetchArtifactBlobs } from '../lib/usePrefetchArtifactBlobs'
import { artifactKindIcon, externalLinkUrl } from '../lib/artifactMedia'
import { ArtifactFilePreview } from './task-detail/ArtifactFilePreview'
import './AuthPage.css'
import './ExternalSharePage.css'
import './task-detail/CommentsSection.css'

function otherTaskId(link: TaskLink, taskId: string): string {
  return link.from_task_id === taskId ? link.to_task_id : link.from_task_id
}

function GuestArtifactRow({
  token,
  scope,
  artifact,
}: {
  token: string
  scope: string
  artifact: Artifact
}) {
  const { t } = useTranslation(['externalShare', 'artifacts'])
  const linkUrl = externalLinkUrl(artifact)
  const downloadable = Boolean(artifact.storage_key || artifact.content_text)

  return (
    <li className="external-share-artifact">
      <div className="external-share-artifact-meta">
        <Icon name={artifactKindIcon(artifact.kind)} size={14} />
        <UserBidiText text={artifact.title} className="truncate" />
        <span className="muted small">
          {t(`artifacts:kind.${artifact.kind}`, { defaultValue: artifact.kind })}
        </span>
        {linkUrl && (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="btn ghost small">
            <Icon name="external" size={12} />
          </a>
        )}
        {downloadable && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() =>
              void api.downloadPublicShareArtifact(token, artifact.id, artifact.title)
            }
          >
            {t('externalShare:download')}
          </button>
        )}
      </div>
      {(artifact.kind === 'text' || artifact.kind === 'json') && artifact.content_text ? (
        <pre className="external-share-text" dir="auto">
          {artifact.content_text}
        </pre>
      ) : (
        <ArtifactFilePreview taskId={scope} artifact={artifact} />
      )}
    </li>
  )
}

function GuestComments({ comments }: { comments: TaskComment[] }) {
  const { t } = useTranslation('externalShare')
  if (comments.length === 0) {
    return <p className="muted small">{t('commentsEmpty')}</p>
  }
  return (
    <ul className="comment-thread">
      {comments.map((c) => (
        <li key={c.id} className="comment-item">
          <div className="comment-meta">
            <strong>{c.author_label || c.author_display_name}</strong>
            <span className="muted small" title={formatDateTime(c.created_at)}>
              {formatRelative(c.created_at)}
            </span>
          </div>
          <MarkdownView source={c.body} className="comment-body" />
          {c.attachments?.length > 0 && (
            <ul className="external-share-chip-list">
              {c.attachments.map((art) => (
                <li key={art.id} className="tag">
                  <Icon name={artifactKindIcon(art.kind)} size={12} />
                  <UserBidiText text={art.title} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

function GuestEvents({ events }: { events: TaskEvent[] }) {
  const { t } = useTranslation('externalShare')
  if (events.length === 0) {
    return <p className="muted small">{t('activityEmpty')}</p>
  }
  return (
    <ul className="external-share-events">
      {events.map((event) => (
        <li key={event.id}>
          <span className="tag">{humanize(event.type)}</span>
          {event.actor_token_name || event.actor_role_name ? (
            <span className="muted small">
              {event.actor_token_name || event.actor_role_name}
            </span>
          ) : null}
          <span className="muted small" title={formatDateTime(event.created_at)}>
            {formatRelative(event.created_at)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function GuestRelated({
  title,
  empty,
  tasks,
}: {
  title: string
  empty: string
  tasks: Task[]
}) {
  const { t } = useTranslation('externalShare')
  return (
    <Section icon="subtasks" title={title} count={tasks.length}>
      {tasks.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="external-share-chip-list">
          {tasks.map((row) => (
            <li key={row.id} className="tag" title={t('noAccess')}>
              <span>#{row.number}</span>
              <UserBidiText text={row.title} />
              <span className="muted small">{t('noAccess')}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function GuestLinks({ taskId, links }: { taskId: string; links: TaskLink[] }) {
  const { t } = useTranslation('externalShare')
  return (
    <Section icon="link" title={t('links')} count={links.length}>
      {links.length === 0 ? (
        <p className="muted small">{t('linksEmpty')}</p>
      ) : (
        <ul className="external-share-chip-list">
          {links.map((link) => (
            <li key={link.id} className="tag" title={t('noAccess')}>
              <span>{humanize(link.kind)}</span>
              <code>{otherTaskId(link, taskId)}</code>
              <span className="muted small">{t('noAccess')}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function ExternalSharePage() {
  const { t } = useTranslation(['externalShare', 'common'])
  const { token: rawToken } = useParams()
  const token = rawToken?.trim() ?? ''
  const scope = useMemo(() => publicShareBlobScope(token), [token])
  const [detail, setDetail] = useState<ExternalShareDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => retainArtifactBlobScope(scope), [scope])

  useEffect(() => {
    if (!token) {
      setError(t('externalShare:notFound'))
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .getPublicShare(token)
      .then((body) => {
        if (!cancelled) setDetail(body)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setDetail(null)
          setError(err.message || t('externalShare:loadFailed'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, t])

  usePrefetchArtifactBlobs(scope, detail?.artifacts ?? [])

  return (
    <main className="external-share-page">
      <header className="external-share-chrome">
        <Logo />
        <div className="external-share-chrome-meta">
          <p className="muted small">{t('externalShare:guestHint')}</p>
          <LanguageSwitcher />
        </div>
      </header>

      {loading && (
        <div className="external-share-loading">
          <Spinner />
        </div>
      )}

      {!loading && error && (
        <div className="external-share-card">
          <Alert>
            {error.includes('not found') || error.includes('Not Found')
              ? t('externalShare:notFound')
              : error}
          </Alert>
        </div>
      )}

      {!loading && detail && (
        <article className="external-share-card">
          <header className="external-share-header">
            <p className="eyebrow">{t('externalShare:subtitle')}</p>
            <h1>
              <span className="muted">#{detail.task.number}</span>{' '}
              <UserBidiText text={detail.task.title} />
            </h1>
            <div className="detail-meta">
              <StatusBadge status={detail.task.status} />
              <PriorityBadge priority={detail.task.priority} />
              <DueBadge due={detail.task.due_at} closed={Boolean(detail.task.completed_at)} />
              <span className="muted small" title={formatDateTime(detail.task.created_at)}>
                {t('externalShare:created', { when: formatRelative(detail.task.created_at) })}
              </span>
            </div>
          </header>

          <Section icon="text" title={t('externalShare:description')}>
            <MarkdownView
              source={detail.task.description ?? ''}
              empty={<p className="muted small">{t('externalShare:descriptionEmpty')}</p>}
            />
          </Section>

          <Section
            icon="paperclip"
            title={t('externalShare:artifacts')}
            count={detail.artifacts.length}
          >
            {detail.artifacts.length === 0 ? (
              <p className="muted small">{t('externalShare:artifactsEmpty')}</p>
            ) : (
              <ul className="external-share-artifact-list">
                {detail.artifacts.map((artifact) => (
                  <GuestArtifactRow
                    key={artifact.id}
                    token={token}
                    scope={scope}
                    artifact={artifact}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section
            icon="message"
            title={t('externalShare:comments')}
            count={detail.comments.length}
          >
            <GuestComments comments={detail.comments} />
          </Section>

          <Section icon="activity" title={t('externalShare:activity')} count={detail.events.length}>
            <GuestEvents events={detail.events} />
          </Section>

          <GuestRelated
            title={t('externalShare:children')}
            empty={t('externalShare:childrenEmpty')}
            tasks={detail.children}
          />
          <GuestLinks taskId={detail.task.id} links={detail.links} />
        </article>
      )}
    </main>
  )
}
