import { useTranslation } from 'react-i18next'

export function PreviewLoading() {
  const { t } = useTranslation('artifacts')
  return <p className="muted small">{t('loadingPreview')}</p>
}
