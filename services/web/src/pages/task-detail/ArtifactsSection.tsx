import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Artifact } from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { artifactKindIcon } from '../../lib/artifactMedia'
import { useAction } from '../../lib/useAction'
import { ArtifactRow } from './ArtifactRow'

const KINDS = ['text', 'link', 'file'] as const
type Kind = (typeof KINDS)[number]

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

type Props = {
  taskId: string
  artifacts: Artifact[]
  onChanged: () => Promise<void>
}

export function ArtifactsSection({ taskId, artifacts, onChanged }: Props) {
  const { t } = useTranslation(['artifacts', 'common'])
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
        if (!file) throw new Error(t('errors.chooseFile'))
        await api.addArtifact(taskId, {
          kind: 'file',
          title: title.trim() || file.name,
          content_base64: await fileToBase64(file),
          content_type: file.type || 'application/octet-stream',
        })
      } else {
        if (!title.trim()) throw new Error(t('errors.needTitle'))
        await api.addArtifact(taskId, { kind, title: title.trim(), content_text: text })
      }
      reset()
      await onChanged()
    }, t('errors.attach'))
  }

  return (
    <Section
      icon="paperclip"
      title={t('title')}
      count={artifacts.length}
      action={
        !open && (
          <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
            <Icon name="plus" />
            {t('attach')}
          </button>
        )
      }
    >
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {artifacts.length === 0 && !open && <p className="muted small">{t('sectionEmpty')}</p>}

      {artifacts.length > 0 && (
        <ul className="list">
          {artifacts.map((a) => (
            <ArtifactRow key={a.id} artifact={a} busy={busy} run={run} onDeleted={onChanged} />
          ))}
        </ul>
      )}

      {open && (
        <form className="stack subtle-panel" onSubmit={onAdd}>
          <div className="segmented" role="radiogroup" aria-label={t('kindLabel')}>
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={kind === k ? 'active' : ''}
                onClick={() => setKind(k)}
              >
                <Icon name={artifactKindIcon(k)} />
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{kind === 'file' ? t('titleFileHint') : t('titleField')}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'link' ? t('linkTitlePlaceholder') : t('titlePlaceholder')}
              required={kind !== 'file'}
              autoFocus
            />
          </label>
          {kind === 'file' ? (
            <label className="dropzone">
              <Icon name="file" size={20} />
              <span>{file ? file.name : t('chooseFile')}</span>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </label>
          ) : kind === 'link' ? (
            <label className="field">
              <span>{t('url')}</span>
              <input
                type="url"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('urlPlaceholder')}
                required
              />
            </label>
          ) : (
            <label className="field">
              <span>{t('content')}</span>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('contentPlaceholder')}
              />
            </label>
          )}
          <div className="actions end">
            <button type="button" className="btn ghost" onClick={reset}>
              {t('common:cancel')}
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {t('attach')}
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}
