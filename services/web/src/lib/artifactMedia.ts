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

export function isImageArtifact(artifact: {
  content_type: string | null
  title: string
}): boolean {
  const mediaType = (artifact.content_type ?? '').split(';', 1)[0]!.trim().toLowerCase()
  if (mediaType.startsWith('image/')) return true
  const name = artifact.title.trim().toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return IMAGE_EXTENSIONS.has(name.slice(dot))
}
