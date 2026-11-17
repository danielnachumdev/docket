/** Scroll/highlight helpers for in-page comment refs and attachments. */

export function highlightById(elementId: string) {
  const el =
    document.getElementById(elementId) ??
    document.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(elementId)}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('comment-flash')
  window.setTimeout(() => el.classList.remove('comment-flash'), 1600)
}

export function commentAnchorId(commentId: number) {
  return `comment-${commentId}`
}

export function artifactAnchorId(artifactId: number) {
  return `artifact-${artifactId}`
}

export function shareUserAnchorId(userId: number) {
  return `share-user-${userId}`
}

export function highlightComment(commentId: number) {
  highlightById(commentAnchorId(commentId))
}

export function highlightArtifact(artifactId: number) {
  highlightById(artifactAnchorId(artifactId))
}

export function highlightShare(userId: number) {
  highlightById(shareUserAnchorId(userId))
}
