import { useEffect, useRef } from 'react'

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Single-key shortcut that is ignored while typing, with modifiers held, or under a modal. */
export function useKeyboardShortcut(key: string, handler: () => void, enabled = true) {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() !== key.toLowerCase()) return
      if (isTypingTarget(e.target)) return
      if (document.body.classList.contains('dialog-open')) return
      e.preventDefault()
      handlerRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, enabled])
}
