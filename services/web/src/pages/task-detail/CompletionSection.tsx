type Props = {
  requireArtifact: boolean
  schemaText: string
  onRequireArtifact: (value: boolean) => void
  onSchemaText: (value: string) => void
  recordedOutcome: string | null
}

export function CompletionSection({
  requireArtifact,
  schemaText,
  onRequireArtifact,
  onSchemaText,
  recordedOutcome,
}: Props) {
  return (
    <section className="card stack">
      <span className="card-label">Completion</span>
      <label className="switch">
        <input
          type="checkbox"
          checked={requireArtifact}
          onChange={(e) => onRequireArtifact(e.target.checked)}
        />
        <span className="switch-track" aria-hidden="true" />
        <span>Require artifact to mark done</span>
      </label>
      <label className="field">
        <span>Outcome JSON Schema (optional)</span>
        <textarea
          className="mono"
          rows={6}
          spellCheck={false}
          placeholder='{"type":"object","required":["summary"],"properties":{"summary":{"type":"string"}}}'
          value={schemaText}
          onChange={(e) => onSchemaText(e.target.value)}
        />
      </label>
      <p className="muted small">
        When a schema is set, completing the task requires a matching JSON outcome.
      </p>
      {recordedOutcome && (
        <label className="field">
          <span>Recorded outcome</span>
          <pre className="outcome-preview mono">{pretty(recordedOutcome)}</pre>
        </label>
      )}
    </section>
  )
}

function pretty(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
