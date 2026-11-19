import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  datetimeInputPlaceholder,
  formatLocalInputValue,
  parseDateTimeInput,
  toLocalInputValue,
} from '../lib/format'
import { usePreferences } from '../preferences'
import { Icon } from './Icon'
import './DateTimeField.css'

export type DateTimeFieldHandle = {
  focus: () => void
  showPicker: () => void
}

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

export const DateTimeField = forwardRef<DateTimeFieldHandle, Props>(
  function DateTimeField({ value, onChange, disabled, id, 'aria-label': ariaLabel }, ref) {
    const { t } = useTranslation('detail')
    const { dateFormat, timeFormat } = usePreferences()
    const formats = { dateFormat, timeFormat }
    const textRef = useRef<HTMLInputElement>(null)
    const pickerRef = useRef<HTMLInputElement>(null)
    const [text, setText] = useState(() => formatLocalInputValue(value, formats))

    useEffect(() => {
      setText(formatLocalInputValue(value, formats))
    }, [value, dateFormat, timeFormat])

    useImperativeHandle(ref, () => ({
      focus() {
        textRef.current?.focus()
      },
      showPicker() {
        const picker = pickerRef.current
        if (!picker) return
        try {
          picker.showPicker?.()
        } catch {
          picker.focus()
          picker.click()
        }
      },
    }))

    function commit(raw: string) {
      const trimmed = raw.trim()
      if (!trimmed) {
        onChange('')
        setText('')
        return
      }
      const parsed = parseDateTimeInput(trimmed, formats)
      if (!parsed) {
        setText(formatLocalInputValue(value, formats))
        return
      }
      const next = toLocalInputValue(parsed)
      onChange(next)
      setText(formatLocalInputValue(next, formats))
    }

    function onPickerChange(e: ChangeEvent<HTMLInputElement>) {
      onChange(e.target.value)
    }

    function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit(text)
      }
    }

    return (
      <span className="datetime-field">
        <input
          ref={textRef}
          id={id}
          type="text"
          className="datetime-field-text"
          value={text}
          disabled={disabled}
          aria-label={ariaLabel}
          placeholder={datetimeInputPlaceholder(formats)}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={onKeyDown}
        />
        <span className="datetime-field-picker-wrap">
          <input
            ref={pickerRef}
            type="datetime-local"
            className="datetime-field-picker"
            value={value}
            disabled={disabled}
            tabIndex={-1}
            aria-hidden="true"
            onChange={onPickerChange}
          />
          <button
            type="button"
            className="icon-btn datetime-field-calendar"
            disabled={disabled}
            aria-label={t('pickDeadline')}
            title={t('pickDeadline')}
            onClick={() => {
              const picker = pickerRef.current
              if (!picker) return
              try {
                picker.showPicker?.()
              } catch {
                picker.focus()
                picker.click()
              }
            }}
          >
            <Icon name="calendar" size={14} />
          </button>
        </span>
      </span>
    )
  },
)
