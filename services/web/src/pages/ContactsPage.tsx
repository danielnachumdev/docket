import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type Contact } from '../api'
import { Alert, EmptyState } from '../components/Feedback'
import { Skeleton } from '../components/Skeleton'
import { Icon } from '../components/Icon'
import { ListRow } from '../components/ListRow'
import { PageHeader } from '../components/PageHeader'
import { initials } from '../lib/format'
import './ContactsPage.css'

export function ContactsPage() {
  const { t } = useTranslation(['integrations', 'common'])
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async (q: string) => {
    setContacts(await api.listContacts(q))
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      load(query).catch((err: Error) => setError(err.message))
    }, 200)
    return () => window.clearTimeout(handle)
  }, [load, query])

  function startEdit(contact: Contact) {
    setEditingId(contact.id)
    setDraft(contact.nickname ?? '')
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft('')
  }

  async function saveNickname(contact: Contact, nickname: string | null) {
    setSavingId(contact.id)
    setError(null)
    try {
      const updated = await api.patchContactNickname(contact.id, nickname)
      setContacts((rows) =>
        rows?.map((row) => (row.id === updated.id ? updated : row)) ?? null,
      )
      setEditingId(null)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('contacts.nicknameSaveFailed'))
    } finally {
      setSavingId(null)
    }
  }

  function onSubmit(event: FormEvent, contact: Contact) {
    event.preventDefault()
    const trimmed = draft.trim().replace(/^@+/, '')
    void saveNickname(contact, trimmed.length ? trimmed : null)
  }

  return (
    <main className="page narrow">
      <PageHeader title={t('contacts.title')} subtitle={t('contacts.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      <label className="search wide">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('contacts.searchPlaceholder')}
          aria-label={t('contacts.searchLabel')}
          maxLength={200}
        />
      </label>

      {contacts == null ? (
        <Skeleton rows={3} leading="avatar" />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={query.trim() ? 'search' : 'users'}
          title={t('contacts.emptyTitle')}
          action={
            !query.trim() && (
              <Link to="/invites" className="btn">
                <Icon name="userPlus" />
                {t('contacts.inviteAction')}
              </Link>
            )
          }
        >
          {query.trim() ? t('contacts.emptySearchHint') : t('contacts.emptyHint')}
        </EmptyState>
      ) : (
        <ul className="card list">
          {contacts.map((contact) => (
            <ListRow
              key={contact.id}
              className="contact-row"
              leading={
                <span className="avatar small" aria-hidden="true">
                  {initials(contact.display_name)}
                </span>
              }
              title={contact.display_name}
              subtitle={contact.email}
              trailing={
                editingId === contact.id ? (
                  contact.nickname ? (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => void saveNickname(contact, null)}
                      disabled={savingId === contact.id}
                    >
                      {t('contacts.clearNickname')}
                    </button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => startEdit(contact)}
                  >
                    {contact.nickname
                      ? t('contacts.editNickname')
                      : t('contacts.setNickname')}
                  </button>
                )
              }
            >
              {editingId === contact.id ? (
                <form
                  className="contact-nick-form"
                  onSubmit={(event) => onSubmit(event, contact)}
                >
                  <div className="inline-form contact-nick-form-row">
                    <label className="sr-only" htmlFor={`nick-${contact.id}`}>
                      {t('contacts.nicknameLabel')}
                    </label>
                    <input
                      id={`nick-${contact.id}`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={t('contacts.nicknamePlaceholder')}
                      maxLength={32}
                      autoComplete="off"
                      autoFocus
                      disabled={savingId === contact.id}
                      aria-describedby={`nick-hint-${contact.id}`}
                    />
                    <button type="submit" className="btn small" disabled={savingId === contact.id}>
                      {t('common:save')}
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={cancelEdit}
                      disabled={savingId === contact.id}
                    >
                      {t('common:cancel')}
                    </button>
                  </div>
                  <p id={`nick-hint-${contact.id}`} className="muted small contact-nick-hint">
                    {t('contacts.nicknameHint')}
                  </p>
                </form>
              ) : contact.nickname ? (
                <span className="tag nick-tag">
                  {t('contacts.nicknameValue', { nickname: contact.nickname })}
                </span>
              ) : (
                <span className="muted small block">{t('contacts.nicknameUnset')}</span>
              )}
            </ListRow>
          ))}
        </ul>
      )}
    </main>
  )
}
