import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'
import { resolveActiveTokens } from '../lib/theme'
import {
  BUILTIN_SWATCH,
  BUILTIN_THEME_IDS,
  THEME_GROUPS,
  THEME_TOKEN_META,
  isBuiltinThemeId,
  isHexColor,
  toColorInputValue,
  tokensToStyle,
  type BuiltinThemeId,
  type ThemeTokenKey,
  type ThemeTokens,
} from '../lib/themeTokens'
import './ThemeStudio.css'

function builtinLabel(
  id: BuiltinThemeId,
  t: (key: string) => string,
): string {
  if (id === 'dark') return t('common:themeDark')
  if (id === 'lilac') return t('common:themeLilac')
  if (id === 'sage') return t('common:themeSage')
  if (id === 'sky') return t('common:themeSky')
  if (id === 'sand') return t('common:themeSand')
  if (id === 'dusk') return t('common:themeDusk')
  return t('common:themeLight')
}
import { usePreferences } from '../preferences'

export function ThemeStudio() {
  const { t } = useTranslation(['auth', 'common'])
  const {
    theme,
    setTheme,
    customThemes,
    addCustomTheme,
    renameCustomTheme,
    deleteCustomTheme,
    setCustomThemeToken,
    resetCustomThemeTokens,
  } = usePreferences()

  const activeCustom = useMemo(
    () => customThemes.find((c) => c.id === theme) ?? null,
    [customThemes, theme],
  )
  const editable = activeCustom != null

  const [tokens, setTokens] = useState<ThemeTokens>(() =>
    resolveActiveTokens(theme, customThemes),
  )
  const [hexDrafts, setHexDrafts] = useState<Partial<Record<ThemeTokenKey, string>>>({})
  const [nameDraft, setNameDraft] = useState(activeCustom?.name ?? '')

  useEffect(() => {
    setTokens(resolveActiveTokens(theme, customThemes))
    setHexDrafts({})
  }, [theme, customThemes])

  useEffect(() => {
    setNameDraft(activeCustom?.name ?? '')
  }, [activeCustom?.id, activeCustom?.name])

  function patchToken(key: ThemeTokenKey, value: string) {
    if (!activeCustom) return
    setCustomThemeToken(activeCustom.id, key, value)
    setHexDrafts((prev) => {
      if (!(key in prev)) return prev
      const copy = { ...prev }
      delete copy[key]
      return copy
    })
  }

  function commitName() {
    if (!activeCustom) return
    const next = nameDraft.replace(/\s+/g, ' ').trim()
    if (!next || next === activeCustom.name) {
      setNameDraft(activeCustom.name)
      return
    }
    renameCustomTheme(activeCustom.id, next)
  }

  const previewStyle = tokensToStyle(tokens)

  return (
    <div className="theme-studio">
      <div className="theme-studio-toolbar">
        <div className="theme-selector" role="radiogroup" aria-label={t('common:theme')}>
          {BUILTIN_THEME_IDS.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={theme === mode}
              className={theme === mode ? 'active' : ''}
              onClick={() => setTheme(mode)}
            >
              {BUILTIN_SWATCH[mode] ? (
                <span
                  className="theme-swatch"
                  style={{ background: BUILTIN_SWATCH[mode] }}
                  aria-hidden="true"
                />
              ) : (
                <Icon name={mode === 'light' ? 'sun' : 'moon'} size={14} />
              )}
              {builtinLabel(mode, t)}
              <span className="tag caps">{t('auth:themeBuiltin')}</span>
            </button>
          ))}
          {customThemes.map((custom) => (
            <button
              key={custom.id}
              type="button"
              role="radio"
              aria-checked={theme === custom.id}
              className={theme === custom.id ? 'active' : ''}
              onClick={() => setTheme(custom.id)}
              title={custom.name}
            >
              <span
                className="theme-swatch"
                style={{ background: custom.tokens.accent }}
                aria-hidden="true"
              />
              <span className="theme-selector-label">{custom.name}</span>
            </button>
          ))}
          <button
            type="button"
            className="theme-add"
            onClick={() => addCustomTheme(theme)}
          >
            <Icon name="plus" size={14} />
            {t('auth:themeAddCustom')}
          </button>
        </div>
      </div>

      <p className="muted theme-studio-lead">{t('auth:themeStudioLead')}</p>

      {editable && activeCustom ? (
        <div className="theme-custom-bar">
          <label className="field theme-name-field">
            <span>{t('auth:themeName')}</span>
            <input
              type="text"
              value={nameDraft}
              maxLength={48}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
          </label>
          <div className="theme-custom-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => resetCustomThemeTokens(activeCustom.id)}
            >
              {t('auth:themeResetBase')}
            </button>
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => deleteCustomTheme(activeCustom.id)}
            >
              {t('auth:themeDelete')}
            </button>
          </div>
        </div>
      ) : (
        <div className="theme-builtin-note">
          <p className="muted">{t('auth:themeBuiltinHint')}</p>
          <button type="button" className="btn ghost" onClick={() => addCustomTheme(theme)}>
            <Icon name="plus" size={14} />
            {t('auth:themeDuplicateCustom')}
          </button>
        </div>
      )}

      <div className="theme-studio-grid">
        <div className={`theme-studio-editor${editable ? '' : ' is-readonly'}`}>
          {THEME_GROUPS.map((group) => {
            const tokensInGroup = THEME_TOKEN_META.filter((m) => m.group === group.id)
            return (
              <details key={group.id} className="theme-group">
                <summary className="theme-group-summary">
                  <span className="theme-group-heading">
                    <Icon name="chevronRight" size={16} className="theme-group-chevron" />
                    {t(`auth:${group.labelKey}`)}
                  </span>
                  <span className="muted">{tokensInGroup.length}</span>
                </summary>
                <div className="theme-token-list">
                  {tokensInGroup.map((meta) => {
                    const value = tokens[meta.key]
                    const hexValue = hexDrafts[meta.key] ?? value
                    return (
                      <label key={meta.key} className="theme-token-row">
                        <span className="theme-token-copy">
                          <span className="theme-token-label">
                            {t(`auth:${meta.labelKey}`)}
                          </span>
                          <span className="theme-token-hint muted">
                            {t(`auth:${meta.hintKey}`)}
                          </span>
                          <code className="theme-token-var">--{meta.key}</code>
                        </span>
                        <span className="theme-token-controls">
                          {meta.kind === 'color' && isHexColor(value) ? (
                            <>
                              <input
                                type="color"
                                className="theme-color-swatch"
                                value={toColorInputValue(value)}
                                aria-label={t(`auth:${meta.labelKey}`)}
                                disabled={!editable}
                                onChange={(e) => patchToken(meta.key, e.target.value)}
                              />
                              <input
                                type="text"
                                className="theme-color-hex"
                                value={hexValue}
                                spellCheck={false}
                                disabled={!editable}
                                onChange={(e) => {
                                  const next = e.target.value.trim()
                                  setHexDrafts((prev) => ({ ...prev, [meta.key]: next }))
                                  if (isHexColor(next)) patchToken(meta.key, next)
                                }}
                                onBlur={() => {
                                  const draft = hexDrafts[meta.key]
                                  if (draft != null && !isHexColor(draft)) {
                                    setHexDrafts((prev) => {
                                      const copy = { ...prev }
                                      delete copy[meta.key]
                                      return copy
                                    })
                                  }
                                }}
                              />
                            </>
                          ) : (
                            <input
                              type="text"
                              className="theme-shadow-input"
                              value={value}
                              spellCheck={false}
                              disabled={!editable}
                              onChange={(e) => patchToken(meta.key, e.target.value)}
                            />
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </details>
            )
          })}
        </div>

        <aside className="theme-studio-preview" aria-label={t('auth:themePreview')}>
          <div className="theme-preview-frame" style={previewStyle}>
            <div className="theme-preview-card">
              <header className="theme-preview-header">
                <strong>{t('auth:themePreviewTitle')}</strong>
                <span className="muted">{t('auth:themePreviewSubtitle')}</span>
              </header>

              <div className="theme-preview-actions">
                <button type="button" className="theme-preview-btn primary">
                  {t('auth:themePreviewPrimary')}
                </button>
                <button type="button" className="theme-preview-btn ghost">
                  {t('auth:themePreviewSecondary')}
                </button>
                <a
                  href="#theme-preview"
                  className="theme-preview-link"
                  onClick={(e) => e.preventDefault()}
                >
                  {t('auth:themePreviewLink')}
                </a>
              </div>

              <label className="theme-preview-field">
                <span>{t('auth:themePreviewInput')}</span>
                <input type="text" readOnly value={t('auth:themePreviewInputValue')} />
              </label>

              <div className="theme-preview-chips">
                <span className="theme-preview-chip accent">
                  {t('auth:themePreviewChipAccent')}
                </span>
                <span className="theme-preview-chip danger">
                  {t('auth:themePreviewChipDanger')}
                </span>
                <span className="theme-preview-chip warning">
                  {t('auth:themePreviewChipWarning')}
                </span>
                <span className="theme-preview-chip success">
                  {t('auth:themePreviewChipSuccess')}
                </span>
              </div>

              <div className="theme-preview-statuses">
                {(
                  [
                    ['st-backlog', 'tokenStBacklog'],
                    ['st-in_progress', 'tokenStInProgress'],
                    ['st-blocked', 'tokenStBlocked'],
                    ['st-on_hold', 'tokenStOnHold'],
                    ['st-failed', 'tokenStFailed'],
                    ['st-done', 'tokenStDone'],
                    ['st-cancelled', 'tokenStCancelled'],
                  ] as const
                ).map(([key, labelKey]) => (
                  <span
                    key={key}
                    className="theme-preview-status"
                    style={{ '--st': `var(--${key})` } as CSSProperties}
                  >
                    {t(`auth:${labelKey}`)}
                  </span>
                ))}
              </div>

              <div className="theme-preview-priorities">
                {(['p1', 'p2', 'p3', 'p4'] as const).map((key) => (
                  <span
                    key={key}
                    className="theme-preview-priority"
                    style={{ background: `var(--${key})` }}
                    title={key.toUpperCase()}
                  />
                ))}
              </div>
            </div>
          </div>
          <p className="muted theme-preview-note">{t('auth:themePreviewNote')}</p>
          {!isBuiltinThemeId(theme) && activeCustom && (
            <p className="muted theme-preview-note">
              {t('auth:themeBasedOn', {
                base: builtinLabel(activeCustom.base, t),
              })}
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
