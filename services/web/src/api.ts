export type User = {
  id: number
  email: string | null
  display_name: string
}

export type AuthStatus = {
  bootstrapped: boolean
  user: User | null
  permissions: string[]
}

export type RegistrationInvite = {
  id: number
  email: string | null
  expires_at: string
  consumed_at: string | null
  consumed_by_user_id: number | null
  created_at: string
}

export type RegistrationInviteCreated = RegistrationInvite & {
  token: string
  register_path: string
}

export type InvitePreview = {
  valid: boolean
  email: string | null
  email_bound: boolean
  expires_at: string
}

export type Task = {
  id: string
  number: number
  owner_user_id: number
  parent_task_id: string | null
  external_id: string | null
  title: string
  body: string | null
  status: string
  priority: number
  rank: number
  source: string
  due_at: string | null
  claimed_by_token_id: number | null
  claimed_by_token_name: string | null
  claim_expires_at: string | null
  last_error: string | null
  require_artifact_on_done: boolean
  outcome_schema_json: string | null
  outcome_json: string | null
  completed_at: string | null
  cancelled_at: string | null
  archived_at: string | null
  unread: boolean
  shared: boolean
  created_at: string
  updated_at: string
}

export type SavedView = {
  id: number
  name: string
  filter_key: string
  query: string
  position: number
  created_at: string
  updated_at: string
}

export type TaskEvent = {
  id: number
  task_id: string
  type: string
  actor_user_id: number
  actor_token_id: number | null
  actor_token_name: string | null
  actor_role_name: string | null
  payload_json: string | null
  created_at: string
}

export type Artifact = {
  id: number
  task_id: string
  kind: string
  title: string
  content_text: string | null
  storage_key: string | null
  content_type: string | null
  created_by_user_id: number
  created_at: string
  can_modify?: boolean
  task_title?: string | null
  task_number?: number | null
}

export type TaskLink = {
  id: number
  from_task_id: string
  to_task_id: string
  kind: string
  created_by_user_id: number
  created_by_token_id: number | null
  created_at: string
}

export type TaskDetail = {
  task: Task
  events: TaskEvent[]
  artifacts: Artifact[]
  children: Task[]
  links: TaskLink[]
  watching: boolean
}

export type Notification = {
  id: number
  user_id: number
  task_id: string | null
  kind: string
  title: string
  body: string | null
  payload_json: string | null
  actor_user_id: number
  read_at: string | null
  created_at: string
}

export type UnreadCount = {
  count: number
}

export type CommentRef = {
  kind: 'user' | 'task' | 'artifact' | 'comment' | string
  raw: string
  start: number
  end: number
  label?: string
  user_id?: number
  email?: string | null
  display_name?: string
  task_id?: string
  number?: number
  title?: string
  artifact_id?: number
  comment_id?: number
}

export type TaskComment = {
  id: number
  event_id: number | null
  task_id: string
  body: string
  refs: CommentRef[]
  mentioned_user_ids: number[]
  author_user_id: number
  author_display_name: string
  author_email: string | null
  created_at: string
  updated_at: string
  can_edit: boolean
}

export type MentionableUser = {
  user_id: number
  email: string | null
  display_name: string
  handle: string
}

export type Contact = {
  id: number
  email: string | null
  display_name: string
}

export type TaskShare = {
  id: number
  user_id: number
  email: string | null
  display_name: string
  role: 'viewer' | 'commentor' | 'editor' | string
  created_at: string
}

export type Role = {
  id: number
  name: string
  description: string
}

export type ApiToken = {
  id: number
  name: string
  role_id: number | null
  role_name: string | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type ApiTokenCreated = ApiToken & {
  token: string
}

export type Webhook = {
  id: number
  name: string
  url: string
  event_types: string[]
  enabled: boolean
  created_at: string
  last_delivered_at: string | null
  last_status_code: number | null
  last_error: string | null
}

export type WebhookCreated = Webhook & {
  secret: string
}

export type VersionStatus = {
  version: string
  latest_version: string | null
  update_available: boolean
  release_url: string | null
}

export type UserPreferences = {
  theme: 'light' | 'dark' | null
  locale: 'en' | 'he' | null
}

async function requestError(res: Response): Promise<never> {
  let detail = res.statusText
  try {
    const body = (await res.json()) as { detail?: string }
    if (typeof body.detail === 'string') detail = body.detail
  } catch {
    /* ignore */
  }
  throw new Error(detail || `HTTP ${res.status}`)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!res.ok) await requestError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function fetchBlob(
  path: string,
  fallbackFilename: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) await requestError(res)
  const blob = await res.blob()
  const header = res.headers.get('content-disposition')
  const match = header?.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
  const encoded = match?.[1]
  const plain = match?.[2]
  const filename = encoded
    ? decodeURIComponent(encoded)
    : plain || fallbackFilename
  return { blob, filename }
}

async function downloadBlob(path: string, fallbackFilename: string): Promise<void> {
  const { blob, filename } = await fetchBlob(path, fallbackFilename)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const api = {
  version: () => request<VersionStatus>('/api/version'),
  status: () => request<AuthStatus>('/api/auth/status'),
  getPreferences: () => request<UserPreferences>('/api/me/preferences'),
  patchPreferences: (body: Partial<UserPreferences>) =>
    request<UserPreferences>('/api/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  listContacts: (q?: string) => {
    const params = new URLSearchParams()
    if (q?.trim()) params.set('q', q.trim())
    const qs = params.toString()
    return request<Contact[]>(`/api/me/contacts${qs ? `?${qs}` : ''}`)
  },
  bootstrap: (body: { email: string; display_name: string; password: string }) =>
    request<User>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: {
    token: string
    email: string
    display_name: string
    password: string
  }) =>
    request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  previewInvite: (token: string) =>
    request<InvitePreview>(`/api/auth/invites/${encodeURIComponent(token)}`),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  listInvites: () => request<RegistrationInvite[]>('/api/invites'),
  createInvite: (body: { email?: string | null } = {}) =>
    request<RegistrationInviteCreated>('/api/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeInvite: (id: number) =>
    request<void>(`/api/invites/${id}`, { method: 'DELETE' }),
  listTasks: (opts?: {
    archived?: boolean
    rootsOnly?: boolean
    parentTaskId?: string
  }) => {
    const params = new URLSearchParams()
    params.set('archived', String(opts?.archived ?? false))
    if (opts?.parentTaskId != null) {
      params.set('parent_task_id', String(opts.parentTaskId))
    } else if (opts?.rootsOnly) {
      params.set('roots_only', 'true')
    }
    return request<Task[]>(`/api/tasks?${params}`)
  },
  getTask: (id: string) => request<TaskDetail>(`/api/tasks/${id}`),
  createTask: (body: {
    title: string
    body?: string
    priority?: number
    parent_task_id?: string | null
    due_at?: string | null
    external_id?: string | null
  }) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  reorderTask: (
    id: string,
    body: { before_task_id?: string | null; after_task_id?: string | null } = {},
  ) =>
    request<Task>(`/api/tasks/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  bulkUpdateTasks: (body: {
    task_ids: string[]
    status?: string
    priority?: number
  }) =>
    request<Task[]>('/api/tasks/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setStatus: (id: string, status: string, outcome?: Record<string, unknown>) =>
    request<Task>(`/api/tasks/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(outcome === undefined ? { status } : { status, outcome }),
    }),
  archive: (id: string) => request<Task>(`/api/tasks/${id}/archive`, { method: 'POST' }),
  unarchive: (id: string) =>
    request<Task>(`/api/tasks/${id}/unarchive`, { method: 'POST' }),
  markTaskRead: (id: string) =>
    request<Task>(`/api/tasks/${id}/read`, { method: 'POST' }),
  markTaskUnread: (id: string) =>
    request<Task>(`/api/tasks/${id}/unread`, { method: 'POST' }),
  deleteTask: (id: string) =>
    request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  listArtifacts: () => request<Artifact[]>('/api/artifacts'),
  addArtifact: (
    id: string,
    body: {
      kind: 'link' | 'text' | 'file' | 'json'
      title: string
      content_text?: string
      content_base64?: string
      content_type?: string
    },
  ) =>
    request<Artifact>(`/api/tasks/${id}/artifacts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteArtifact: (id: string, artifactId: number) =>
    request<void>(`/api/tasks/${id}/artifacts/${artifactId}`, { method: 'DELETE' }),
  downloadArtifactContent: async (id: string, artifactId: number, filename: string) => {
    await downloadBlob(
      `/api/tasks/${id}/artifacts/${artifactId}/content`,
      filename,
    )
  },
  fetchArtifactContentBlob: async (id: string, artifactId: number, filename: string) => {
    const { blob } = await fetchBlob(
      `/api/tasks/${id}/artifacts/${artifactId}/content`,
      filename,
    )
    return blob
  },
  downloadTaskExport: async (id: string) => {
    await downloadBlob(`/api/tasks/${id}/export`, `docket-task-${id}-export.zip`)
  },
  createLink: (id: string, body: { to_task_id: string; kind: string }) =>
    request<TaskLink>(`/api/tasks/${id}/links`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteLink: (id: string, linkId: number) =>
    request<void>(`/api/tasks/${id}/links/${linkId}`, { method: 'DELETE' }),
  listShares: (id: string) => request<TaskShare[]>(`/api/tasks/${id}/shares`),
  shareTask: (id: string, body: { email: string; role: 'viewer' | 'commentor' | 'editor' }) =>
    request<TaskShare>(`/api/tasks/${id}/shares`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  unshareTask: (id: string, membershipId: number) =>
    request<void>(`/api/tasks/${id}/shares/${membershipId}`, { method: 'DELETE' }),
  watchTask: (id: string) =>
    request<{ watching: boolean }>(`/api/tasks/${id}/watch`, { method: 'PUT' }),
  unwatchTask: (id: string) =>
    request<void>(`/api/tasks/${id}/watch`, { method: 'DELETE' }),
  listComments: (id: string) => request<TaskComment[]>(`/api/tasks/${id}/comments`),
  listMentionables: (id: string) =>
    request<MentionableUser[]>(`/api/tasks/${id}/mentionables`),
  addComment: (id: string, body: string) =>
    request<TaskComment>(`/api/tasks/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  updateComment: (id: string, commentId: number, body: string) =>
    request<TaskComment>(`/api/tasks/${id}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  deleteComment: (id: string, commentId: number) =>
    request<void>(`/api/tasks/${id}/comments/${commentId}`, { method: 'DELETE' }),
  listNotifications: (opts?: { unreadOnly?: boolean; limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.unreadOnly) params.set('unread_only', 'true')
    if (opts?.limit != null) params.set('limit', String(opts.limit))
    const qs = params.toString()
    return request<Notification[]>(`/api/notifications${qs ? `?${qs}` : ''}`)
  },
  unreadNotificationCount: () =>
    request<UnreadCount>('/api/notifications/unread-count'),
  markNotificationRead: (id: number) =>
    request<Notification>(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<UnreadCount>('/api/notifications/read-all', { method: 'POST' }),
  listTokens: (includeRevoked = false) =>
    request<ApiToken[]>(`/api/tokens?include_revoked=${includeRevoked}`),
  listAssignableRoles: () => request<Role[]>('/api/tokens/roles'),
  createToken: (body: { name: string; role_id?: number | null }) =>
    request<ApiTokenCreated>('/api/tokens', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeToken: (id: number) =>
    request<ApiToken>(`/api/tokens/${id}/revoke`, { method: 'POST' }),
  listSavedViews: () => request<SavedView[]>('/api/saved-views'),
  createSavedView: (body: {
    name: string
    filter_key: string
    query?: string
    position?: number
  }) =>
    request<SavedView>('/api/saved-views', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSavedView: (
    id: number,
    body: {
      name?: string
      filter_key?: string
      query?: string
      position?: number
    },
  ) =>
    request<SavedView>(`/api/saved-views/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteSavedView: (id: number) =>
    request<void>(`/api/saved-views/${id}`, { method: 'DELETE' }),
  listWebhooks: () => request<Webhook[]>('/api/webhooks'),
  createWebhook: (body: { name: string; url: string; event_types?: string[] }) =>
    request<WebhookCreated>('/api/webhooks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateWebhook: (
    id: number,
    body: {
      name?: string
      url?: string
      event_types?: string[]
      enabled?: boolean
    },
  ) =>
    request<Webhook>(`/api/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteWebhook: (id: number) =>
    request<void>(`/api/webhooks/${id}`, { method: 'DELETE' }),
}
