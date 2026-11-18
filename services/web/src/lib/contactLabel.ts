import type { Contact, MentionableUser } from '../api'

/** Preferred picker label: nickname (email), else display_name (email), else name/email alone. */
export function contactPickerLabel(person: {
  display_name: string
  email: string | null
  nickname: string | null
}): string {
  const name = person.nickname?.trim() || person.display_name
  if (person.email) return `${name} (${person.email})`
  return name
}

export function contactMatchesQuery(
  person: { display_name: string; email: string | null; nickname: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    person.display_name.toLowerCase().includes(q) ||
    (person.email ?? '').toLowerCase().includes(q) ||
    (person.nickname ?? '').toLowerCase().includes(q)
  )
}

export function mentionInsertToken(user: MentionableUser): string {
  return `@${user.handle}`
}

export function contactFromMentionable(user: MentionableUser): Contact {
  return {
    id: user.user_id,
    email: user.email,
    display_name: user.display_name,
    nickname: user.nickname,
  }
}
