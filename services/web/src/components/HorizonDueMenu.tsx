import { useTranslation } from 'react-i18next'
import { Menu, type MenuItem } from './Menu'
import { HORIZON_IDS, type HorizonId } from '../lib/localDay'

export type HorizonDueChoice = HorizonId | 'exact' | 'clear'

type Props = {
  label: string
  hasDue: boolean
  disabled?: boolean
  className?: string
  /** When true, omit Exact (e.g. list row — Exact lives on detail). */
  omitExact?: boolean
  onChoose: (choice: HorizonDueChoice) => void
}

/** Calendar trigger + horizon chips as a quick menu (Today…Clear). */
export function HorizonDueMenu({
  label,
  hasDue,
  disabled = false,
  className,
  omitExact = false,
  onChoose,
}: Props) {
  const { t } = useTranslation('tasks')
  const items: MenuItem[] = [
    ...HORIZON_IDS.map((id) => ({
      label: t(`horizon.${id}`),
      icon: 'calendar' as const,
      onSelect: () => onChoose(id),
      disabled,
    })),
    ...(!omitExact
      ? [
          {
            label: t('horizon.exact'),
            icon: 'calendar' as const,
            onSelect: () => onChoose('exact'),
            disabled,
          },
        ]
      : []),
    {
      label: t('horizon.clear'),
      icon: 'x' as const,
      onSelect: () => onChoose('clear'),
      disabled: disabled || !hasDue,
    },
  ]

  return (
    <Menu
      label={label}
      icon="calendar"
      className={[
        'horizon-due-menu',
        hasDue ? 'has-due' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      items={items}
    />
  )
}

type ChipsProps = {
  disabled?: boolean
  onChoose: (choice: HorizonDueChoice) => void
  exactActive?: boolean
}

/** Inline horizon chip row for task detail. */
export function HorizonDueChips({ disabled = false, onChoose, exactActive }: ChipsProps) {
  const { t } = useTranslation('tasks')
  const choices: HorizonDueChoice[] = [...HORIZON_IDS, 'exact', 'clear']
  return (
    <div className="horizon-chips" role="group" aria-label={t('horizon.group')}>
      {choices.map((id) => (
        <button
          key={id}
          type="button"
          className={
            id === 'exact' && exactActive
              ? 'chip horizon-chip active'
              : 'chip horizon-chip'
          }
          disabled={disabled}
          onClick={() => onChoose(id)}
        >
          {t(`horizon.${id}`)}
        </button>
      ))}
    </div>
  )
}
