import { useCallback, useState } from 'react'
import i18n from '../i18n'
import { errorMessage } from './format'

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (fn: () => Promise<unknown>, fallback?: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(errorMessage(err, fallback ?? i18n.t('somethingWentWrong', { ns: 'common' })))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  return { busy, error, setError, run }
}
