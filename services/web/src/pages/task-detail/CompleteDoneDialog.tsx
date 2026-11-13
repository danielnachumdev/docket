import { useState } from 'react'

type Props = {
  requireArtifact: boolean
  artifactCount: number
  schemaText: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: (outcome?: Record<string, unknown>) => void
}

export function CompleteDoneDialog({
  requireArtifact,
  artifactCount,
  schemaText,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const needsOutcome = Boolean(schemaText && schemaText.trim())
  const missingArtifact = requireArtifact && artifactCount < 1
  const [outcomeText, setOutcomeText] = useState('{\n  \n}')
  const [localError, setLocalError] = useState<string | null>(null)

  function submit() {
    setLocalError(null)
    if (missingArtifact) {
      setLocalError('Attach at least one artifact before marking done.')
      return
    }
    if (!needsOutcome) {
      onConfirm()
      return
    }
    try {
      const parsed = JSON.parse(outcomeText) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setLocalError('Outcome must be a JSON object.')
        return
      }
      onConfirm(parsed as Record<string, unknown>)
    } catch {
      setLocalError('Outcome must be valid JSON.')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal card stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-done-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="complete-done-title">Mark task done</h2>
        <p className="muted small">
          This task requires structured completion details before status can become done.
        </p>
        {requireArtifact && (
          <p className={missingArtifact ? 'danger-text' : 'muted small'}>
            Artifact required · currently {artifactCount}
          </p>
        )}
        {needsOutcome && (
          <label className="field">
            <span>Outcome JSON</span>
            <textarea
              className="mono"
              rows={8}
              spellCheck={false}
              value={outcomeText}
              onChange={(e) => setOutcomeText(e.target.value)}
            />
          </label>
        )}
        {localError && <p className="danger-text">{localError}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || missingArtifact}
            onClick={submit}
          >
            {busy ? 'Saving…' : 'Mark done'}
          </button>
        </div>
      </div>
    </div>
  )
}
