import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Contact } from '../api'
import { contactMatchesQuery, contactPickerLabel } from '../lib/contactLabel'
import { UserBidiText } from './UserBidiText'
import './CollaboratorPicker.css'

type Props = {
  value: Contact | null
  onChange: (contact: Contact | null) => void
  /** Extra client-side filter (e.g. exclude already-shared users). */
  excludeIds?: ReadonlySet<number>
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
}

export function CollaboratorPicker({
  value,
  onChange,
  excludeIds,
  disabled = false,
  placeholder,
  'aria-label': ariaLabel,
}: Props) {
  const { t } = useTranslation('detail')
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (disabled) return
    const handle = window.setTimeout(() => {
      void api
        .listContacts(query.trim() || undefined)
        .then(setContacts)
        .catch(() => setContacts([]))
    }, 200)
    return () => window.clearTimeout(handle)
  }, [query, disabled])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const options = useMemo(() => {
    return contacts
      .filter((c) => !excludeIds?.has(c.id))
      .filter((c) => contactMatchesQuery(c, query))
      .slice(0, 8)
  }, [contacts, excludeIds, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [options])

  function select(contact: Contact) {
    onChange(contact)
    setQuery('')
    setOpen(false)
  }

  function clear() {
    onChange(null)
    setQuery('')
    setOpen(false)
  }

  if (value) {
    return (
      <div className="collaborator-picker collaborator-picker-selected">
        <span className="collaborator-picker-chip">
          <UserBidiText text={contactPickerLabel(value)} />
        </span>
        <button
          type="button"
          className="btn ghost small"
          disabled={disabled}
          onClick={clear}
        >
          {t('sharing.changePerson')}
        </button>
      </div>
    )
  }

  return (
    <div className="collaborator-picker" ref={rootRef}>
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel ?? t('sharing.personLabel')}
        placeholder={placeholder ?? t('sharing.personPlaceholder')}
        value={query}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            setOpen(true)
            return
          }
          if (e.key === 'Escape') {
            setOpen(false)
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && open && options[activeIndex]) {
            e.preventDefault()
            select(options[activeIndex]!)
          }
        }}
      />
      {open && (
        <ul id={listId} className="collaborator-picker-list" role="listbox">
          {options.length === 0 ? (
            <li className="collaborator-picker-empty muted small">
              {t('sharing.noCollaborators')}
            </li>
          ) : (
            options.map((c, index) => (
              <li key={c.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={
                    index === activeIndex
                      ? 'collaborator-picker-item is-active'
                      : 'collaborator-picker-item'
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(c)}
                >
                  <UserBidiText text={contactPickerLabel(c)} />
                  {c.nickname && c.display_name !== c.nickname && (
                    <UserBidiText text={c.display_name} className="muted small" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
