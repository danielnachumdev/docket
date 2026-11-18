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
  description: string | null
  status: string
  priority: number
  rank: number
  source: string
  due_at: string | null
  /** Named chip / exact intent; null = legacy timestamp-only grouping. */
  due_horizon: 'today' | 'tomorrow' | 'week' | 'month' | 'quarter' | 'year' | 'exact' | null
  claimed_by_token_id: number | null
  claimed_by_token_name: string | null
  claim_expires_at: string | null
  last_error: string | null
  status_reason: string | null
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
  /** Stored blob bytes for kind=file; 0 for inline kinds. */
  byte_size?: number
  created_by_user_id: number
  created_at: string
  can_modify?: boolean
  task_title?: string | null
  task_number?: number | null
}

export type StorageKindTotal = {
  kind: string
  artifact_count: number
  stored_bytes: number
}

export type StorageUploader = {
  user_id: number
  email: string | null
  display_name: string
  artifact_count: number
  stored_bytes: number
}

export type StorageTask = {
  task_id: string
  task_number: number
  title: string
  artifact_count: number
  stored_bytes: number
}

export type StorageOverview = {
  size_note: string
  artifact_count: number
  stored_bytes: number
  by_kind: StorageKindTotal[]
  by_uploader: StorageUploader[]
  top_tasks: StorageTask[]
}

export type DayCount = { day: string; count: number }

export type UserStats = {
  window_days: number
  generated_at: string
  throughput: { completed: number; prior_completed: number; delta: number }
  completion_rate: {
    done: number
    failed: number
    cancelled: number
    rate: number | null
  }
  cycle_time: { sample_size: number; median_hours: number | null }
  wip: { open: number; open_older_than_7d: number; open_older_than_30d: number }
  blocked: { count: number }
  failed: { count: number; in_window: number }
  priority: { p1_p2_open: number; p1_p2_done_in_window: number }
  streak: { current_days: number; active_days_in_window: number }
  actor_mix: { agent_completions: number; human_completions: number }
  claims: { active: number; expired: number }
  outcomes: { with_outcome: number; without_outcome: number }
  shared: { owned_completions: number; shared_with_me_completions: number }
  completions_by_day: DayCount[]
}

export type BackupImportResult = {
  exported_at: string
  artifacts_restored: number
  artifact_bytes: number
  artifacts_missing: number
  message: string
}

export type ArtifactListPage = {
  items: Artifact[]
  total: number
  offset: number
  limit: number
  has_more: boolean
  kind_counts: Record<string, number>
}

export type ArtifactListParams = {
  kind?: string
  q?: string
  sort?: string
  mine?: boolean
  offset?: number
  limit?: number
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
  /** False when the target exists but is not shared with the viewer (Slack-style). */
  accessible?: boolean
}

export type TaskComment = {
  id: number
  event_id: number | null
  task_id: string
  body: string
  refs: CommentRef[]
  mentioned_user_ids: number[]
  author_user_id: number
  author_token_id: number | null
  author_token_name: string | null
  author_display_name: string
  author_email: string | null
  author_label: string
  attachments: Artifact[]
  created_at: string
  updated_at: string
  can_edit: boolean
}

export type ActivityActor = {
  user_id: number
  token_id: number | null
  label: string
  display_name: string | null
  email: string | null
  token_name: string | null
}

export type ActivityItem = {
  id: string
  kind: 'comment' | 'event'
  created_at: string
  actor: ActivityActor
  comment: TaskComment | null
  event: TaskEvent | null
}

export type ActivityFeed = {
  items: ActivityItem[]
  order: 'asc' | 'desc'
}

export type MentionableUser = {
  user_id: number
  email: string | null
  display_name: string
  handle: string
  nickname: string | null
}

export type Contact = {
  id: number
  email: string | null
  display_name: string
  nickname: string | null
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

export type CustomThemePreference = {
  id: string
  name: string
  base: 'light' | 'dark'
  tokens: Record<string, string>
}

export type TaskSortMode = 'custom' | 'date'

export type NotificationSort = 'newest' | 'oldest'

/** All in-app notification kinds the API can emit (claim_renewed is never emitted). */
export const NOTIFICATION_KINDS = [
  'status_changed',
  'commented',
  'mentioned',
  'shared',
  'invite_accepted',
  'artifact_added',
  'task_updated',
  'claimed',
  'released',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** Default feed selection: meaningful activity, not claim/release lease noise. */
export const DEFAULT_NOTIFICATION_KINDS: NotificationKind[] = [
  'mentioned',
  'shared',
  'commented',
  'status_changed',
  'invite_accepted',
  'artifact_added',
  'task_updated',
]

export type UserPreferences = {
  theme: string | null
  locale: 'en' | 'he' | null
  custom_themes: CustomThemePreference[] | null
  task_sort_mode: TaskSortMode | null
  notification_kinds: string[] | null
  notification_sort: NotificationSort | null
}

function formatValidationItem(item: unknown): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object' && 'msg' in item) {
    const msg = String((item as { msg: unknown }).msg)
    return msg.replace(/^Value error,\s*/i, '')
  }
  return ''
}

/** Flatten FastAPI `detail` (string or validation error array) for UI. */
function formatApiDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map(formatValidationItem).filter(Boolean).join('; ')
  }
  return ''
}

async function requestError(res: Response): Promise<never> {
  let detail = ''
  try {
    const body = (await res.json()) as { detail?: unknown }
    detail = formatApiDetail(body.detail)
  } catch {
    /* ignore */
  }
  throw new Error(detail || 'Request failed')
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
  getMyStats: (windowDays = 7) =>
    request<UserStats>(`/api/me/stats?window_days=${windowDays}`),
  listContacts: (q?: string) => {
    const params = new URLSearchParams()
    if (q?.trim()) params.set('q', q.trim())
    const qs = params.toString()
    return request<Contact[]>(`/api/me/contacts${qs ? `?${qs}` : ''}`)
  },
  patchContactNickname: (userId: number, nickname: string | null) =>
    request<Contact>(`/api/me/contacts/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    }),
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
  updateMe: (body: { display_name: string }) =>
    request<User>('/api/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
  listInvites: () => request<RegistrationInvite[]>('/api/invites'),
  createInvite: (body: { email?: string | null } = {}) =>
    request<RegistrationInviteCreated>('/api/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeInvite: (id: number) =>
    request<void>(`/api/invites/${id}`, { method: 'DELETE' }),
  getAdminStorage: () => request<StorageOverview>('/api/admin/storage'),
  downloadAdminBackup: async () => {
    await downloadBlob(
      '/api/admin/backup/export',
      'waymark-instance-backup.zip',
    )
  },
  importAdminBackup: async (file: File, confirm: string) => {
    const body = new FormData()
    body.append('file', file)
    body.append('confirm', confirm)
    const res = await fetch('/api/admin/backup/import', {
      method: 'POST',
      credentials: 'include',
      body,
    })
    if (!res.ok) await requestError(res)
    return res.json() as Promise<BackupImportResult>
  },
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
    description?: string
    priority?: number
    parent_task_id?: string | null
    due_at?: string | null
    external_id?: string | null
  }) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  listActivity: (id: string, order: 'asc' | 'desc' = 'desc') =>
    request<ActivityFeed>(`/api/tasks/${id}/activity?order=${order}`),
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
    unread?: boolean
  }) =>
    request<Task[]>('/api/tasks/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setStatus: (
    id: string,
    status: string,
    options?: {
      outcome?: Record<string, unknown>
      reason?: string
      last_error?: string
    },
  ) =>
    request<Task>(`/api/tasks/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        ...(options?.outcome !== undefined ? { outcome: options.outcome } : {}),
        ...(options?.reason !== undefined ? { reason: options.reason } : {}),
        ...(options?.last_error !== undefined ? { last_error: options.last_error } : {}),
      }),
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
  listArtifacts: (opts?: ArtifactListParams) => {
    const params = new URLSearchParams()
    if (opts?.kind && opts.kind !== 'all') params.set('kind', opts.kind)
    if (opts?.q?.trim()) params.set('q', opts.q.trim())
    if (opts?.sort) params.set('sort', opts.sort)
    if (opts?.mine) params.set('mine', 'true')
    if (opts?.offset != null) params.set('offset', String(opts.offset))
    if (opts?.limit != null) params.set('limit', String(opts.limit))
    const qs = params.toString()
    return request<ArtifactListPage>(`/api/artifacts${qs ? `?${qs}` : ''}`)
  },
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
  updateArtifact: (
    id: string,
    artifactId: number,
    body: {
      title?: string
      content_text?: string
      content_base64?: string
      content_type?: string
      clear_blob?: boolean
    },
  ) =>
    request<Artifact>(`/api/tasks/${id}/artifacts/${artifactId}`, {
      method: 'PATCH',
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
    await downloadBlob(`/api/tasks/${id}/export`, `waymark-task-${id}-export.zip`)
  },
  createLink: (id: string, body: { to_task_id: string; kind: string }) =>
    request<TaskLink>(`/api/tasks/${id}/links`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteLink: (id: string, linkId: number) =>
    request<void>(`/api/tasks/${id}/links/${linkId}`, { method: 'DELETE' }),
  listShares: (id: string) => request<TaskShare[]>(`/api/tasks/${id}/shares`),
  shareTask: (
    id: string,
    body: {
      user_id?: number
      email?: string
      role: 'viewer' | 'commentor' | 'editor'
    },
  ) =>
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
  addComment: (
    id: string,
    body: string,
    attachments?: Array<{
      kind: 'link' | 'text' | 'file' | 'json'
      title: string
      content_text?: string | null
      content_base64?: string | null
      content_type?: string | null
    }>,
  ) =>
    request<TaskComment>(`/api/tasks/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body,
        ...(attachments?.length ? { attachments } : {}),
      }),
    }),
  updateComment: (id: string, commentId: number, body: string) =>
    request<TaskComment>(`/api/tasks/${id}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  attachCommentArtifact: (
    id: string,
    commentId: number,
    body: {
      kind: 'link' | 'text' | 'file' | 'json'
      title: string
      content_text?: string | null
      content_base64?: string | null
      content_type?: string | null
    },
  ) =>
    request<Artifact>(`/api/tasks/${id}/comments/${commentId}/artifacts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteComment: (id: string, commentId: number) =>
    request<void>(`/api/tasks/${id}/comments/${commentId}`, { method: 'DELETE' }),
  listNotifications: (opts?: {
    unreadOnly?: boolean
    limit?: number
    kinds?: string[]
    sort?: NotificationSort
  }) => {
    const params = new URLSearchParams()
    if (opts?.unreadOnly) params.set('unread_only', 'true')
    if (opts?.limit != null) params.set('limit', String(opts.limit))
    if (opts?.sort) params.set('sort', opts.sort)
    for (const kind of opts?.kinds ?? []) params.append('kind', kind)
    const qs = params.toString()
    return request<Notification[]>(`/api/notifications${qs ? `?${qs}` : ''}`)
  },
  unreadNotificationCount: async (opts?: { kinds?: string[] }) => {
    if (opts?.kinds && opts.kinds.length === 0) return { count: 0 }
    const params = new URLSearchParams()
    for (const kind of opts?.kinds ?? []) params.append('kind', kind)
    const qs = params.toString()
    return request<UnreadCount>(`/api/notifications/unread-count${qs ? `?${qs}` : ''}`)
  },
  markNotificationRead: (id: number) =>
    request<Notification>(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: async (opts?: { kinds?: string[] }) => {
    if (opts?.kinds && opts.kinds.length === 0) return { count: 0 }
    const params = new URLSearchParams()
    for (const kind of opts?.kinds ?? []) params.append('kind', kind)
    const qs = params.toString()
    return request<UnreadCount>(`/api/notifications/read-all${qs ? `?${qs}` : ''}`, {
      method: 'POST',
    })
  },
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
