import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { api, type StorageOverview } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon, type IconName } from '../components/Icon'
import { ListRow } from '../components/ListRow'
import { PageHeader } from '../components/PageHeader'
import { Section } from '../components/Section'
import { SectionHeading } from '../components/SectionHeading'
import { StatCard, StatGrid } from '../components/StatCard'
import { UserBidiText } from '../components/UserBidiText'
import { formatBytes, formatDateTime } from '../lib/format'
import { useToast } from '../lib/toast'
import './StoragePage.css'

type Props = {
  canAdmin?: boolean
}

const KIND_ICON: Record<string, IconName> = { file: 'file', link: 'link' }
const CONFIRM_TOKEN = 'REPLACE'

function kindLabel(kind: string) {
  const key = `storage.kindLabel.${kind}`
  if (i18n.exists(key, { ns: 'integrations' })) {
    return i18n.t(key, { ns: 'integrations' })
  }
  return kind
}

export function StoragePage({ canAdmin = false }: Props) {
  const { t } = useTranslation(['integrations', 'common'])
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [overview, setOverview] = useState<StorageOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    if (!canAdmin) {
      setOverview(null)
      return
    }
    setOverview(await api.getAdminStorage())
  }, [canAdmin])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message || t('storage.loadFailed')))
  }, [load, t])

  const usage = (row: { artifact_count: number; stored_bytes: number }) => [
    `${t('storage.count')}: ${row.artifact_count}`,
    `${t('storage.bytes')}: ${formatBytes(row.stored_bytes)}`,
  ]

  async function onExport() {
    setError(null)
    setSuccess(null)
    setExporting(true)
    try {
      await api.downloadAdminBackup()
      toast(t('storage.backupExport'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('storage.backupExportFailed'))
    } finally {
      setExporting(false)
    }
  }

  async function onImport() {
    setError(null)
    setSuccess(null)
    if (!selectedFile) {
      setError(t('storage.backupNoFile'))
      return
    }
    setImporting(true)
    try {
      const result = await api.importAdminBackup(selectedFile, 'replace')
      const message = t('storage.backupImportSuccess', {
        count: result.artifacts_restored,
        bytes: formatBytes(result.artifact_bytes),
        when: formatDateTime(result.exported_at),
      })
      setSuccess(message)
      toast(message)
      setUnderstood(false)
      setConfirmText('')
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('storage.backupImportFailed'))
    } finally {
      setImporting(false)
    }
  }

  const canImport =
    canAdmin &&
    understood &&
    confirmText.trim().toUpperCase() === CONFIRM_TOKEN &&
    selectedFile != null &&
    !importing

  return (
    <main className="page narrow">
      <PageHeader title={t('storage.title')} subtitle={t('storage.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {success && (
        <Alert tone="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {!canAdmin && <Alert tone="info">{t('storage.ownerOnlyHint')}</Alert>}
      {canAdmin && <Alert tone="info">{t('storage.sizeNote')}</Alert>}

      {!canAdmin ? null : overview == null ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <SectionHeading title={t('storage.totalsTitle')} />
          <StatGrid>
            <StatCard label={t('storage.totalArtifacts')} value={overview.artifact_count} />
            <StatCard label={t('storage.totalBytes')} value={formatBytes(overview.stored_bytes)} />
          </StatGrid>

          <Section icon="database" title={t('storage.backupTitle')}>
            <p className="muted small">{t('storage.backupSubtitle')}</p>
            <div className="backup-row">
              <div className="min-0">
                <strong className="block">{t('storage.backupExport')}</strong>
                <span className="muted small">{t('storage.backupExportHint')}</span>
              </div>
              <button
                type="button"
                className="btn primary"
                disabled={exporting || importing}
                onClick={() => void onExport()}
              >
                <Icon name="download" />
                {exporting ? t('storage.backupExporting') : t('storage.backupExport')}
              </button>
            </div>

            <div className="backup-restore stack">
              <strong>{t('storage.backupImportTitle')}</strong>
              <Alert tone="warning">{t('storage.backupImportWarning')}</Alert>
              <label className="field">
                <span>{t('storage.backupImportPick')}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip,application/zip"
                  disabled={importing}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="field">
                <span>{t('storage.backupImportTypeLabel')}</span>
                <input
                  type="text"
                  value={confirmText}
                  disabled={importing}
                  autoComplete="off"
                  placeholder={t('storage.backupImportTypePlaceholder')}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={understood}
                  disabled={importing}
                  onChange={(e) => setUnderstood(e.target.checked)}
                />
                <span>{t('storage.backupImportConfirmLabel')}</span>
              </label>
              <div className="actions end">
                <button
                  type="button"
                  className="btn danger-solid"
                  disabled={!canImport}
                  onClick={() => void onImport()}
                >
                  {importing ? t('storage.backupImporting') : t('storage.backupImportSubmit')}
                </button>
              </div>
            </div>
          </Section>

          <SectionHeading title={t('storage.byKindTitle')} count={overview.by_kind.length} />
          {overview.by_kind.length === 0 ? (
            <EmptyState icon="paperclip" title={t('storage.emptyUploadersTitle')}>
              {t('storage.emptyUploadersHint')}
            </EmptyState>
          ) : (
            <ul className="card list">
              {overview.by_kind.map((row) => (
                <ListRow
                  key={row.kind}
                  icon={KIND_ICON[row.kind] ?? 'text'}
                  title={kindLabel(row.kind)}
                  meta={usage(row)}
                />
              ))}
            </ul>
          )}

          <SectionHeading
            title={t('storage.uploadersTitle')}
            count={overview.by_uploader.length}
          />
          {overview.by_uploader.length === 0 ? (
            <EmptyState icon="users" title={t('storage.emptyUploadersTitle')}>
              {t('storage.emptyUploadersHint')}
            </EmptyState>
          ) : (
            <ul className="card list">
              {overview.by_uploader.map((row) => (
                <ListRow
                  key={row.user_id}
                  icon="users"
                  title={row.display_name}
                  meta={[row.email ?? t('common:emDash'), ...usage(row)]}
                />
              ))}
            </ul>
          )}

          <SectionHeading title={t('storage.topTasksTitle')} count={overview.top_tasks.length} />
          {overview.top_tasks.length === 0 ? (
            <p className="muted">{t('storage.emptyTopTasks')}</p>
          ) : (
            <ul className="card list">
              {overview.top_tasks.map((row) => (
                <ListRow
                  key={row.task_id}
                  icon="tasks"
                  title={
                    <Link to={`/tasks/${row.task_id}`} className="strong-link">
                      <UserBidiText text={`#${row.task_number} ${row.title}`} />
                    </Link>
                  }
                  meta={usage(row)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
