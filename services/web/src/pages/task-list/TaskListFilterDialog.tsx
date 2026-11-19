import { useTranslation } from 'react-i18next'
import type { SavedView } from '../../api'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { STATUSES } from '../../lib/format'
import { SMART_FILTERS, filterLabel, type FilterKey } from '../../lib/smartFilters'

type StatusChip = 'active' | 'all' | (typeof STATUSES)[number]

type Props = {
  open: boolean
  onClose: () => void
  archived: boolean
  filter: FilterKey
  activeSavedId: number | null
  counts: Record<string, number>
  savedViews: SavedView[]
  busy: boolean
  filtersNarrowed: boolean
  onSelectFilter: (key: FilterKey) => void
  onSelectSavedView: (view: SavedView) => void
  onDeleteSavedView: (view: SavedView) => void
  onSaveView: () => void
  onClearFilters: () => void
}

export function TaskListFilterDialog({
  open,
  onClose,
  archived,
  filter,
  activeSavedId,
  counts,
  savedViews,
  busy,
  filtersNarrowed,
  onSelectFilter,
  onSelectSavedView,
  onDeleteSavedView,
  onSaveView,
  onClearFilters,
}: Props) {
  const { t } = useTranslation('tasks')
  if (!open) return null

  const isSelected = (key: FilterKey) => activeSavedId == null && filter === key
  const statusChips = (['active', 'all', ...STATUSES] as StatusChip[]).filter(
    (key) => key === 'active' || key === 'all' || (counts[key] ?? 0) > 0 || isSelected(key),
  )
  const smartChips = SMART_FILTERS.filter((key) => (counts[key] ?? 0) > 0 || isSelected(key))

  function pickFilter(key: FilterKey) {
    onSelectFilter(key)
    onClose()
  }

  function pickSaved(view: SavedView) {
    onSelectSavedView(view)
    onClose()
  }

  return (
    <Dialog
      title={t('filters')}
      size="md"
      onClose={onClose}
      footer={
        filtersNarrowed ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              onClearFilters()
              onClose()
            }}
          >
            <Icon name="x" size={14} />
            {t('clearFilters')}
          </button>
        ) : undefined
      }
    >
      <div className="filter-sheet">
        <section className="filter-sheet-section" aria-label={t('filterStatus')}>
          <h3 className="filter-sheet-heading">{t('filterStatus')}</h3>
          <div className="filter-sheet-list" role="listbox" aria-label={t('filterByStatus')}>
            {statusChips.map((key) => (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={isSelected(key)}
                className={isSelected(key) ? 'filter-sheet-item active' : 'filter-sheet-item'}
                onClick={() => pickFilter(key)}
              >
                <span>{filterLabel(key)}</span>
                <span className="chip-count">{counts[key] ?? 0}</span>
              </button>
            ))}
          </div>
        </section>

        {!archived && (
          <>
            {smartChips.length > 0 && (
              <section className="filter-sheet-section" aria-label={t('smartFilters')}>
                <h3 className="filter-sheet-heading">{t('smartFilters')}</h3>
                <div className="filter-sheet-list" role="listbox" aria-label={t('smartFilters')}>
                  {smartChips.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={isSelected(key)}
                      className={
                        isSelected(key)
                          ? 'filter-sheet-item smart active'
                          : 'filter-sheet-item smart'
                      }
                      onClick={() => pickFilter(key)}
                    >
                      <span>{filterLabel(key)}</span>
                      <span className="chip-count">{counts[key] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="filter-sheet-section" aria-label={t('savedViews')}>
              <h3 className="filter-sheet-heading">{t('savedViews')}</h3>
              {savedViews.length === 0 ? (
                <p className="filter-sheet-empty muted">{t('noSavedViews')}</p>
              ) : (
                <div className="filter-sheet-list" role="listbox" aria-label={t('savedViews')}>
                  {savedViews.map((view) => (
                    <div
                      key={view.id}
                      className={
                        activeSavedId === view.id
                          ? 'filter-sheet-saved active'
                          : 'filter-sheet-saved'
                      }
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeSavedId === view.id}
                        className="filter-sheet-item saved"
                        onClick={() => pickSaved(view)}
                      >
                        <span>{view.name}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn ghost chip-remove"
                        aria-label={t('deleteSavedViewNamed', { name: view.name })}
                        title={t('deleteSavedView')}
                        onClick={() => void onDeleteSavedView(view)}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="btn ghost small filter-sheet-save"
                disabled={busy}
                onClick={() => {
                  onClose()
                  void onSaveView()
                }}
              >
                <Icon name="plus" size={14} />
                {t('saveView')}
              </button>
            </section>
          </>
        )}
      </div>
    </Dialog>
  )
}
