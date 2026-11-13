import { useState, type FormEvent } from 'react'
import { api, type Artifact } from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon, type IconName } from '../../components/Icon'
import { Section } from '../../components/Section'
import { formatDateTime, formatRelative } from '../../lib/format'
import { useAction } from '../../lib/useAction'

type Kind = 'text' | 'link' | 'file'

const KIND_ICONS: Record<string, IconName> = {
  text: 'text',
  link: 'link',
  file: 'file',
  json: 'text',
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function isUrl(value: string | null) {
  return value != null && /^https?:\/\//i.test(value.trim())
}

type Props = {
  taskId: number
  artifacts: Artifact[]
  onChanged: () => Promise<void>
}

export function ArtifactsSection({ taskId, artifacts, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('text')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const { busy, error, setError, run } = useAction()

  function reset() {
    setTitle('')
    setText('')
    setFile(null)
    setOpen(false)
  }

  function onAdd(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      if (kind === 'file') {
        if (!file) throw new Error('Choose a file to attach')
        await api.addArtifact(taskId, {
          kind: 'file',
          title: title.trim() || file.name,
          content_base64: await fileToBase64(file),
          content_type: file.type || 'application/octet-stream',
        })
      } else {
        if (!title.trim()) throw new Error('Give the artifact a title')
        await api.addArtifact(taskId, { kind, title: title.trim(), content_text: text })
      }
      reset()
      await onChanged()
    }, 'Could not attach artifact')
  }

  function onDelete(artifact: Artifact) {
    if (!window.confirm(`Delete artifact “${artifact.title}”?`)) return
    void run(async () => {
      await api.deleteArtifact(taskId, artifact.id)
      await onChanged()
    }, 'Could not delete artifact')
  }

  return (
    <Section
      icon="paperclip"
      title="Artifacts"
      count={artifacts.length}
      action={
        !open && (
          <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
            <Icon name="plus" />
            Attach
          </button>
        )
      }
    >
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {artifacts.length === 0 && !open && (
        <p className="muted small">No artifacts yet. Attach notes, links, or files produced for this task.</p>
      )}

      {artifacts.length > 0 && (
        <ul className="list">
          {artifacts.map((a) => (
            <li key={a.id} className="artifact">
              <div className="list-row">
                <span className="artifact-icon">
                  <Icon name={KIND_ICONS[a.kind] ?? 'file'} />
                </span>
                <span className="grow">
                  <strong className="truncate block">{a.title}</strong>
                  <span className="muted small" title={formatDateTime(a.created_at)}>
                    {a.kind}
                    {a.content_type && ` · ${a.content_type}`} · {formatRelative(a.created_at)}
                  </span>
                </span>
                <span className="row-actions">
                  {a.kind === 'link' && isUrl(a.content_text) && (
                    <a
                      className="icon-btn"
                      href={a.content_text!.trim()}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open ${a.title}`}
                      title="Open link"
                    >
                      <Icon name="external" />
                    </a>
                  )}
                  {(a.storage_key || a.content_text) && (
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={busy}
                      aria-label={`Download ${a.title}`}
                      title="Download"
                      onClick={() =>
                        void run(
                          () => api.downloadArtifactContent(taskId, a.id, a.title),
                          'Download failed',
                        )
                      }
                    >
                      <Icon name="download" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn danger"
                    disabled={busy}
                    aria-label={`Delete ${a.title}`}
                    title="Delete"
                    onClick={() => onDelete(a)}
                  >
                    <Icon name="trash" />
                  </button>
                </span>
              </div>
              {a.content_text && a.kind !== 'file' && a.kind !== 'link' && (
                <details className="artifact-body">
                  <summary>Show content</summary>
                  <pre>{a.content_text}</pre>
                </details>
              )}
              {a.kind === 'link' && a.content_text && !isUrl(a.content_text) && (
                <p className="muted small break">{a.content_text}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form className="stack subtle-panel" onSubmit={onAdd}>
          <div className="segmented" role="radiogroup" aria-label="Artifact kind">
            {(['text', 'link', 'file'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={kind === k ? 'active' : ''}
                onClick={() => setKind(k)}
              >
                <Icon name={KIND_ICONS[k]!} />
                {k === 'text' ? 'Note' : k === 'link' ? 'Link' : 'File'}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Title{kind === 'file' && ' (defaults to file name)'}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'link' ? 'Pull request, doc, dashboard…' : 'Title'}
              required={kind !== 'file'}
            />
          </label>
          {kind === 'file' ? (
            <label className="dropzone">
              <Icon name="file" size={20} />
              <span>{file ? file.name : 'Choose a file to upload'}</span>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </label>
          ) : kind === 'link' ? (
            <label className="field">
              <span>URL</span>
              <input
                type="url"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="https://example.com/…"
                required
              />
            </label>
          ) : (
            <label className="field">
              <span>Content</span>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Notes, logs, summaries…"
              />
            </label>
          )}
          <div className="actions end">
            <button type="button" className="btn ghost" onClick={reset}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              Attach
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}
