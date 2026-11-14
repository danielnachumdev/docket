import type { IconName } from '../components/Icon'

export type ArtifactPreviewKind = 'image' | 'pdf' | 'audio' | 'video' | 'markdown'

const KIND_ICONS: Record<string, IconName> = {
  text: 'text',
  link: 'link',
  file: 'file',
  json: 'text',
}

export function artifactKindIcon(kind: string): IconName {
  return KIND_ICONS[kind] ?? 'file'
}

type ArtifactRef = {
  content_type: string | null
  title: string
}

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
])

const PDF_EXTENSIONS = new Set(['.pdf'])

const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.weba',
])

const VIDEO_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4', '.ogv', '.webm'])

const MARKDOWN_EXTENSIONS = new Set(['.markdown', '.md'])

const MEDIA_BY_EXTENSION: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.ogv': 'video/ogg',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function mediaType(artifact: ArtifactRef): string {
  return (artifact.content_type ?? '').split(';', 1)[0]!.trim().toLowerCase()
}

function extension(artifact: ArtifactRef): string | null {
  const name = artifact.title.trim().toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  return name.slice(dot)
}

export function inferArtifactMediaType(artifact: ArtifactRef): string | null {
  const type = mediaType(artifact)
  if (type && type !== 'application/octet-stream') return type
  const ext = extension(artifact)
  if (!ext) return null
  return MEDIA_BY_EXTENSION[ext] ?? null
}

export function getArtifactPreviewKind(artifact: ArtifactRef): ArtifactPreviewKind | null {
  const type = mediaType(artifact)
  const ext = extension(artifact)

  if (type.startsWith('image/') || (ext != null && IMAGE_EXTENSIONS.has(ext))) return 'image'
  if (type === 'application/pdf' || (ext != null && PDF_EXTENSIONS.has(ext))) return 'pdf'
  if (type.startsWith('audio/') || (ext != null && AUDIO_EXTENSIONS.has(ext))) return 'audio'
  if (type.startsWith('video/') || (ext != null && VIDEO_EXTENSIONS.has(ext))) return 'video'
  if (
    type === 'text/markdown' ||
    type === 'text/x-markdown' ||
    (ext != null && MARKDOWN_EXTENSIONS.has(ext))
  ) {
    return 'markdown'
  }
  return null
}
