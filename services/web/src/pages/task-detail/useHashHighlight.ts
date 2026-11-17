import { useEffect } from 'react'
import { highlightById } from './commentAnchors'

/** Jump to `#comment-N` / `#artifact-N` / `#share-user-N` when the hash is set or changes. */
export function useHashHighlight(readyToken: unknown) {
  useEffect(() => {
    function focusHash() {
      const id = window.location.hash.replace(/^#/, '')
      if (!id) return
      // DOM may not be ready on first paint after feed load.
      window.requestAnimationFrame(() => {
        highlightById(id)
        if (!document.getElementById(id)) {
          window.setTimeout(() => highlightById(id), 120)
        }
      })
    }
    focusHash()
    window.addEventListener('hashchange', focusHash)
    return () => window.removeEventListener('hashchange', focusHash)
  }, [readyToken])
}
