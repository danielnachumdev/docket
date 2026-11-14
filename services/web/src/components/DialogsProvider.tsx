import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DialogsContext, type ConfirmOptions, type PromptOptions } from '../lib/dialogs'
import { Dialog } from './Dialog'

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }

function PromptDialog({
  options,
  onDone,
}: {
  options: PromptOptions
  onDone: (value: string | null) => void
}) {
  const { t } = useTranslation('common')
  const [value, setValue] = useState(options.initialValue ?? '')
  const trimmed = value.trim()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (trimmed) onDone(trimmed)
  }

  return (
    <Dialog title={options.title} description={options.description} onClose={() => onDone(null)}>
      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span>{options.label}</span>
          <input
            type="text"
            value={value}
            placeholder={options.placeholder}
            maxLength={options.maxLength}
            onChange={(e) => setValue(e.target.value)}
            data-autofocus
          />
        </label>
        <div className="actions end">
          <button type="button" className="btn ghost" onClick={() => onDone(null)}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={!trimmed}>
            {options.confirmLabel ?? t('save')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common')
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ kind: 'confirm', options, resolve })),
    [],
  )

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => setPending({ kind: 'prompt', options, resolve })),
    [],
  )

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  function settleConfirm(ok: boolean) {
    if (pending?.kind === 'confirm') pending.resolve(ok)
    setPending(null)
  }

  function settlePrompt(result: string | null) {
    if (pending?.kind === 'prompt') pending.resolve(result)
    setPending(null)
  }

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {pending?.kind === 'confirm' && (
        <Dialog
          title={pending.options.title}
          description={pending.options.description}
          onClose={() => settleConfirm(false)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                data-autofocus={pending.options.danger ? true : undefined}
                onClick={() => settleConfirm(false)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className={pending.options.danger ? 'btn danger-solid' : 'btn primary'}
                onClick={() => settleConfirm(true)}
              >
                {pending.options.confirmLabel ?? t('confirm')}
              </button>
            </>
          }
        />
      )}
      {pending?.kind === 'prompt' && (
        <PromptDialog options={pending.options} onDone={settlePrompt} />
      )}
    </DialogsContext.Provider>
  )
}
