import { useCallback, useEffect, useState } from 'react'
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

  const load = useCallback(async (q: string) => {
    setContacts(await api.listContacts(q))
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      load(query).catch((err: Error) => setError(err.message))
    }, 200)
    return () => window.clearTimeout(handle)
  }, [load, query])

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
            <li key={contact.id} className="list-row">
              <span className="avatar small" aria-hidden="true">
                {initials(contact.display_name)}
              </span>
              <span className="grow min-0">
                <strong className="block truncate">{contact.display_name}</strong>
                {contact.email && (
                  <span className="muted small block truncate">{contact.email}</span>
                )}
              </span>
              <span className="muted small" title={t('contacts.fromGraph')}>
                <Icon name="users" size={14} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
