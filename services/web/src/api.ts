export type User = {
  id: number
  email: string | null
  display_name: string
}

export type AuthStatus = {
  bootstrapped: boolean
  user: User | null
}

export type Task = {
  id: number
  owner_user_id: number
  parent_task_id: number | null
  external_id: string | null
  title: string
  body: string | null
  status: string
  priority: number
  rank: number
  source: string
  due_at: string | null
  claimed_by_token_id?: number | null
  claim_expires_at?: string | null
  last_error: string | null
  completed_at: string | null
  cancelled_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type TaskEvent = {
  id: number
  task_id: number
  type: string
  actor_user_id: number
  actor_token_id: number | null
  actor_token_name: string | null
  payload_json: string | null
  created_at: string
}

export type Artifact = {
  id: number
  task_id: number
  kind: string
  title: string
  content_text: string | null
  storage_key: string | null
  content_type: string | null
  created_by_user_id: number
  created_at: string
}

export type TaskLink = {
  id: number
  from_task_id: number
  to_task_id: number
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
}

export type TaskShare = {
  id: number
  user_id: number
  email: string | null
  display_name: string
  role: 'viewer' | 'editor' | string
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

export type VersionStatus = {
  version: string
  latest_version: string | null
  update_available: boolean
  release_url: string | null
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

async function downloadBlob(path: string, fallbackFilename: string): Promise<void> {
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
  bootstrap: (body: { email: string; display_name: string; password: string }) =>
    request<User>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  listTasks: (opts?: {
    archived?: boolean
    rootsOnly?: boolean
    parentTaskId?: number
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
  getTask: (id: number) => request<TaskDetail>(`/api/tasks/${id}`),
  createTask: (body: {
    title: string
    body?: string
    priority?: number
    parent_task_id?: number | null
    due_at?: string | null
    external_id?: string | null
  }) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: number, body: Record<string, unknown>) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  setStatus: (id: number, status: string) =>
    request<Task>(`/api/tasks/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  archive: (id: number) => request<Task>(`/api/tasks/${id}/archive`, { method: 'POST' }),
  unarchive: (id: number) =>
    request<Task>(`/api/tasks/${id}/unarchive`, { method: 'POST' }),
  deleteTask: (id: number) =>
    request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  addArtifact: (
    id: number,
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
  deleteArtifact: (id: number, artifactId: number) =>
    request<void>(`/api/tasks/${id}/artifacts/${artifactId}`, { method: 'DELETE' }),
  downloadArtifactContent: async (id: number, artifactId: number, filename: string) => {
    await downloadBlob(
      `/api/tasks/${id}/artifacts/${artifactId}/content`,
      filename,
    )
  },
  downloadTaskExport: async (id: number) => {
    await downloadBlob(`/api/tasks/${id}/export`, `docket-task-${id}-export.zip`)
  },
  createLink: (id: number, body: { to_task_id: number; kind: string }) =>
    request<TaskLink>(`/api/tasks/${id}/links`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteLink: (id: number, linkId: number) =>
    request<void>(`/api/tasks/${id}/links/${linkId}`, { method: 'DELETE' }),
  listShares: (id: number) => request<TaskShare[]>(`/api/tasks/${id}/shares`),
  shareTask: (id: number, body: { email: string; role: 'viewer' | 'editor' }) =>
    request<TaskShare>(`/api/tasks/${id}/shares`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  unshareTask: (id: number, membershipId: number) =>
    request<void>(`/api/tasks/${id}/shares/${membershipId}`, { method: 'DELETE' }),
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
}
