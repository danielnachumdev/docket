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
  title: string
  body: string | null
  status: string
  priority: number
  rank: number
  source: string
  due_at: string | null
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

export type TaskDetail = {
  task: Task
  events: TaskEvent[]
  artifacts: Artifact[]
  children: Task[]
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
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  status: () => request<AuthStatus>('/api/auth/status'),
  bootstrap: (body: { email: string; display_name: string; password: string }) =>
    request<User>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  listTasks: (archived = false) =>
    request<Task[]>(`/api/tasks?archived=${archived}&roots_only=true`),
  getTask: (id: number) => request<TaskDetail>(`/api/tasks/${id}`),
  createTask: (body: {
    title: string
    body?: string
    priority?: number
    parent_task_id?: number | null
    due_at?: string | null
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
    body: { kind: 'link' | 'text' | 'json'; title: string; content_text?: string },
  ) =>
    request<Artifact>(`/api/tasks/${id}/artifacts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
