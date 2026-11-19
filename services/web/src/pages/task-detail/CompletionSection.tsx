import { useTranslation } from 'react-i18next'
import { Section } from '../../components/Section'
import { UserBidiText } from '../../components/UserBidiText'
import { userBidiAttrs } from '../../lib/bidi'
import './CompletionSection.css'

type Props = {
  requireArtifact: boolean
  schemaText: string
  onRequireArtifact: (value: boolean) => void
  onSchemaText: (value: string) => void
  recordedOutcome: string | null
  variant?: 'card' | 'plain'
  /** Render as a disclosure; collapsed on first render when true. */
  defaultCollapsed?: boolean
  readOnly?: boolean
}

export function CompletionSection({
  requireArtifact,
  schemaText,
  onRequireArtifact,
  onSchemaText,
  recordedOutcome,
  variant = 'card',
  defaultCollapsed,
  readOnly = false,
}: Props) {
  const { t } = useTranslation('detail')
  const summary = [
    requireArtifact ? t('completion.summaryArtifact') : null,
    schemaText.trim() ? t('completion.summarySchema') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Section
      icon="target"
      title={t('completion.title')}
      className="stack"
      variant={variant}
      collapsible={defaultCollapsed != null}
      defaultCollapsed={defaultCollapsed}
      collapsedSummary={summary || null}
    >
      {readOnly ? (
        <>
          {requireArtifact ? (
            <p className="muted small">{t('completion.summaryArtifact')}</p>
          ) : null}
          {schemaText.trim() ? (
            <label className="field">
              <span>{t('completion.schema')}</span>
              <UserBidiText text={pretty(schemaText)} as="pre" className="outcome-preview mono" />
            </label>
          ) : null}
          {!requireArtifact && !schemaText.trim() && !recordedOutcome ? (
            <p className="muted small">{t('completion.schemaHint')}</p>
          ) : null}
        </>
      ) : (
        <>
          <label className="switch">
            <input
              type="checkbox"
              checked={requireArtifact}
              onChange={(e) => onRequireArtifact(e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
            <span>{t('completion.requireArtifact')}</span>
          </label>
          <label className="field">
            <span>{t('completion.schema')}</span>
            <textarea
              {...userBidiAttrs(schemaText, 'mono')}
              rows={6}
              spellCheck={false}
              placeholder='{"type":"object","required":["summary"],"properties":{"summary":{"type":"string"}}}'
              value={schemaText}
              onChange={(e) => onSchemaText(e.target.value)}
            />
          </label>
          <p className="muted small">{t('completion.schemaHint')}</p>
        </>
      )}
      {recordedOutcome && (
        <label className="field">
          <span>{t('completion.recordedOutcome')}</span>
          <UserBidiText
            text={pretty(recordedOutcome)}
            as="pre"
            className="outcome-preview mono"
          />
        </label>
      )}
    </Section>
  )
}

function pretty(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
