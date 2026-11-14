import { createContext, useContext, type ReactNode } from 'react'

export type ConfirmOptions = {
  title: string
  description?: ReactNode
  confirmLabel?: string
  danger?: boolean
}

export type PromptOptions = {
  title: string
  description?: ReactNode
  label: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  maxLength?: number
}

type DialogsApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

export const DialogsContext = createContext<DialogsApi | null>(null)

function useDialogs(): DialogsApi {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error('useConfirm/usePrompt must be used inside <DialogsProvider>')
  return ctx
}

export function useConfirm() {
  return useDialogs().confirm
}

export function usePrompt() {
  return useDialogs().prompt
}
