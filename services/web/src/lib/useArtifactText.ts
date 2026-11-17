import { useEffect, useState } from 'react'
import i18n from '../i18n'
import { loadArtifactText, type ArtifactBlobKey } from './artifactObjectUrlCache'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; text: string }

type Settled = { id: string; state: State }

const LOADING: State = { status: 'loading' }

/** UTF-8 body of a markdown / plain-text artifact via the page-scoped blob cache. */
export function useArtifactText({ taskId, artifactId, title, contentType }: ArtifactBlobKey): State {
  const id = `${taskId}:${artifactId}`
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    let cancelled = false
    loadArtifactText({ taskId, artifactId, title, contentType }).then(
      (text) => {
        if (!cancelled) setSettled({ id, state: { status: 'ready', text } })
      },
      (err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : i18n.t('previewFailed', { ns: 'artifacts' })
        setSettled({ id, state: { status: 'error', message } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, taskId, artifactId, title, contentType])

  return settled?.id === id ? settled.state : LOADING
}
