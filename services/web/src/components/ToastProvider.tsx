import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ToastContext, type ToastOptions } from '../lib/toast'
import { Icon } from './Icon'
import './ToastProvider.css'

type Toast = ToastOptions & { id: number }

const DEFAULT_DURATION_MS = 3500
const MAX_VISIBLE = 3

function ToastItem({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const { t } = useTranslation('common')
  const tone = toast.tone ?? 'success'

  useEffect(() => {
    const timer = window.setTimeout(() => onDone(toast.id), toast.durationMs ?? DEFAULT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast, onDone])

  return (
    <div className={`toast tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="toast-icon" aria-hidden="true">
        <Icon name={tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert'} size={14} />
      </span>
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="btn ghost small toast-action"
          onClick={() => {
            toast.action?.onSelect()
            onDone(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="icon-btn toast-close"
        aria-label={t('dismiss')}
        onClick={() => onDone(toast.id)}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const show = useCallback((options: ToastOptions | string) => {
    const opts = typeof options === 'string' ? { message: options } : options
    const id = nextId.current++
    setToasts((prev) => [...prev, { ...opts, id }].slice(-MAX_VISIBLE))
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
