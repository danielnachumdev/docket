import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../components/Dialog'

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
  const { t } = useTranslation(['detail', 'common'])
  const needsOutcome = Boolean(schemaText && schemaText.trim())
  const missingArtifact = requireArtifact && artifactCount < 1
  const [outcomeText, setOutcomeText] = useState('{\n  \n}')
  const [localError, setLocalError] = useState<string | null>(null)

  function submit() {
    setLocalError(null)
    if (missingArtifact) {
      setLocalError(t('complete.needArtifact'))
      return
    }
    if (!needsOutcome) {
      onConfirm()
      return
    }
    try {
      const parsed = JSON.parse(outcomeText) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setLocalError(t('complete.outcomeObject'))
        return
      }
      onConfirm(parsed as Record<string, unknown>)
    } catch {
      setLocalError(t('complete.outcomeJson'))
    }
  }

  return (
    <Dialog
      title={t('complete.title')}
      description={t('complete.intro')}
      size="md"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            {t('common:cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || missingArtifact}
            onClick={submit}
          >
            {busy ? t('common:saving') : t('complete.submit')}
          </button>
        </>
      }
    >
      <div className="stack">
        {requireArtifact && (
          <p className={missingArtifact ? 'danger-text' : 'muted small'}>
            {t('complete.artifactRequired', { count: artifactCount })}
          </p>
        )}
        {needsOutcome && (
          <label className="field">
            <span>{t('complete.outcome')}</span>
            <textarea
              className="mono"
              rows={8}
              spellCheck={false}
              value={outcomeText}
              onChange={(e) => setOutcomeText(e.target.value)}
            />
          </label>
        )}
        {localError && (
          <p className="danger-text" role="alert">
            {localError}
          </p>
        )}
      </div>
    </Dialog>
  )
}
