import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Contact } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { initials } from '../lib/format'

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
    const trimmed = draft.trim()
    void saveNickname(contact, trimmed.length ? trimmed : null)
  }

  return (
    <main className="page narrow">
      <PageHeader title={t('contacts.title')} subtitle={t('contacts.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      <label className="field">
        <span className="sr-only">{t('contacts.searchLabel')}</span>
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
        <Skeleton rows={3} />
      ) : contacts.length === 0 ? (
        <EmptyState icon="users" title={t('contacts.emptyTitle')}>
          {query.trim() ? t('contacts.emptySearchHint') : t('contacts.emptyHint')}
        </EmptyState>
      ) : (
        <ul className="card list">
          {contacts.map((contact) => (
            <li key={contact.id} className="list-row contact-row">
              <span className="avatar small" aria-hidden="true">
                {initials(contact.display_name)}
              </span>
              <span className="grow min-0">
                <strong className="block truncate">{contact.display_name}</strong>
                {contact.email && (
                  <span className="muted small block truncate">{contact.email}</span>
                )}
                {editingId === contact.id ? (
                  <form
                    className="inline-form contact-nick-form"
                    onSubmit={(event) => onSubmit(event, contact)}
                  >
                    <label className="sr-only" htmlFor={`nick-${contact.id}`}>
                      {t('contacts.nicknameLabel')}
                    </label>
                    <input
                      id={`nick-${contact.id}`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={t('contacts.nicknamePlaceholder')}
                      maxLength={32}
                      pattern="[A-Za-z0-9._-]*"
                      autoComplete="off"
                      disabled={savingId === contact.id}
                    />
                    <button
                      type="submit"
                      className="btn small"
                      disabled={savingId === contact.id}
                    >
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
                  </form>
                ) : contact.nickname ? (
                  <span className="muted small block">
                    {t('contacts.nicknameValue', { nickname: contact.nickname })}
                  </span>
                ) : (
                  <span className="muted small block">{t('contacts.nicknameUnset')}</span>
                )}
              </span>
              <span className="row-actions">
                {editingId === contact.id ? (
                  contact.nickname ? (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => void saveNickname(contact, null)}
                      disabled={savingId === contact.id}
                      title={t('contacts.clearNickname')}
                    >
                      {t('contacts.clearNickname')}
                    </button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => startEdit(contact)}
                    title={t('contacts.editNickname')}
                  >
                    {contact.nickname
                      ? t('contacts.editNickname')
                      : t('contacts.setNickname')}
                  </button>
                )}
                <span className="muted small" title={t('contacts.fromGraph')}>
                  <Icon name="users" size={14} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
