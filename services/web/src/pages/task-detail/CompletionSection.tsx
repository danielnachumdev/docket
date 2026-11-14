import { useTranslation } from 'react-i18next'
import { Section } from '../../components/Section'
import { UserBidiText } from '../../components/UserBidiText'
import { userBidiAttrs } from '../../lib/bidi'

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
  const { t } = useTranslation('detail')
  return (
    <Section icon="target" title={t('completion.title')} className="stack">
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
