import type { Artifact } from '../api'

export const ARTIFACT_KIND_FILTERS = ['all', 'text', 'link', 'file'] as const
export type ArtifactKindFilter = (typeof ARTIFACT_KIND_FILTERS)[number]

export const ARTIFACT_SORTS = [
  'newest',
  'oldest',
  'largest',
  'smallest',
  'name',
  'task',
] as const
export type ArtifactSort = (typeof ARTIFACT_SORTS)[number]

export type ArtifactGroup = {
  taskId: string
  taskNumber: number | null
  taskTitle: string
  artifacts: Artifact[]
}

function matchesQuery(artifact: Artifact, query: string, taskFallback: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const taskTitle = (artifact.task_title?.trim() || taskFallback).toLowerCase()
  const taskNumber = artifact.task_number != null ? `#${artifact.task_number}` : ''
  const haystack = [
    artifact.title,
    artifact.content_text ?? '',
    taskTitle,
    taskNumber,
    artifact.task_number != null ? String(artifact.task_number) : '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export function filterArtifacts(
  rows: Artifact[],
  opts: {
    kind: ArtifactKindFilter
    query: string
    mineOnly: boolean
    userId: number | null
    taskFallback: string
  },
): Artifact[] {
  return rows.filter((a) => {
    if (opts.kind !== 'all' && a.kind !== opts.kind) return false
    if (opts.mineOnly && opts.userId != null && a.created_by_user_id !== opts.userId) {
      return false
    }
    return matchesQuery(a, opts.query, opts.taskFallback)
  })
}

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null

/** Sort/display size: stored file bytes, else UTF-8 length of inline content_text. */
export function artifactDisplayBytes(a: Artifact): number {
  if (a.byte_size != null && a.byte_size > 0) return a.byte_size
  if (a.content_text) {
    return textEncoder != null
      ? textEncoder.encode(a.content_text).length
      : a.content_text.length
  }
  return a.byte_size ?? 0
}

function compareArtifacts(a: Artifact, b: Artifact, sort: ArtifactSort): number {
  switch (sort) {
    case 'oldest':
      return a.created_at.localeCompare(b.created_at) || a.id - b.id
    case 'largest':
      return (
        artifactDisplayBytes(b) - artifactDisplayBytes(a) ||
        b.created_at.localeCompare(a.created_at)
      )
    case 'smallest':
      return (
        artifactDisplayBytes(a) - artifactDisplayBytes(b) ||
        a.created_at.localeCompare(b.created_at)
      )
    case 'name':
      return a.title.localeCompare(b.title) || b.created_at.localeCompare(a.created_at)
    case 'task':
    case 'newest':
    default:
      return b.created_at.localeCompare(a.created_at) || b.id - a.id
  }
}

function compareTaskNumber(a: ArtifactGroup, b: ArtifactGroup): number {
  const an = a.taskNumber ?? Number.POSITIVE_INFINITY
  const bn = b.taskNumber ?? Number.POSITIVE_INFINITY
  if (an !== bn) return an - bn
  return a.taskId.localeCompare(b.taskId)
}

function compareGroups(a: ArtifactGroup, b: ArtifactGroup, sort: ArtifactSort): number {
  switch (sort) {
    case 'oldest': {
      const aAt = a.artifacts[0]?.created_at ?? ''
      const bAt = b.artifacts[0]?.created_at ?? ''
      return aAt.localeCompare(bAt) || compareTaskNumber(a, b)
    }
    case 'largest': {
      const aSize = a.artifacts[0] != null ? artifactDisplayBytes(a.artifacts[0]) : -1
      const bSize = b.artifacts[0] != null ? artifactDisplayBytes(b.artifacts[0]) : -1
      return bSize - aSize || compareTaskNumber(a, b)
    }
    case 'smallest': {
      const aSize = a.artifacts[0] != null ? artifactDisplayBytes(a.artifacts[0]) : -1
      const bSize = b.artifacts[0] != null ? artifactDisplayBytes(b.artifacts[0]) : -1
      return aSize - bSize || compareTaskNumber(a, b)
    }
    case 'name':
      return a.taskTitle.localeCompare(b.taskTitle) || compareTaskNumber(a, b)
    case 'task':
      return compareTaskNumber(a, b)
    case 'newest':
    default: {
      const aAt = a.artifacts[0]?.created_at ?? ''
      const bAt = b.artifacts[0]?.created_at ?? ''
      return bAt.localeCompare(aAt) || compareTaskNumber(a, b)
    }
  }
}

export function groupArtifacts(
  rows: Artifact[],
  sort: ArtifactSort,
  taskFallback: string,
): ArtifactGroup[] {
  const byTask = new Map<string, ArtifactGroup>()
  for (const artifact of rows) {
    const key = artifact.task_id
    let group = byTask.get(key)
    if (!group) {
      group = {
        taskId: artifact.task_id,
        taskNumber: artifact.task_number ?? null,
        taskTitle: artifact.task_title?.trim() || taskFallback,
        artifacts: [],
      }
      byTask.set(key, group)
    }
    group.artifacts.push(artifact)
  }

  const groups = [...byTask.values()]
  for (const group of groups) {
    group.artifacts.sort((a, b) => compareArtifacts(a, b, sort))
  }
  groups.sort((a, b) => compareGroups(a, b, sort))
  return groups
}

export function taskGroupLabel(group: ArtifactGroup): string {
  return group.taskNumber != null ? `#${group.taskNumber} ${group.taskTitle}` : group.taskTitle
}
