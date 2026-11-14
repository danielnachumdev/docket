import { createContext, useContext } from 'react'
import type { Tone } from '../components/Feedback'

export type ToastOptions = {
  message: string
  tone?: Tone
  action?: { label: string; onSelect: () => void }
  durationMs?: number
}

export type ToastFn = (options: ToastOptions | string) => void

export const ToastContext = createContext<ToastFn | null>(null)

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
