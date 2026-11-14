/** Strong RTL letters (Hebrew, Arabic, and related presentation forms). */
const STRONG_RTL =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/** Strong LTR letters (Latin + common Latin Extended). Digits/punctuation ignored. */
const STRONG_LTR = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/

/** True when text contains both strong RTL and strong LTR characters. */
export function isMixedBidi(text: string): boolean {
  return STRONG_RTL.test(text) && STRONG_LTR.test(text)
}

export type UserBidiAttrs = {
  dir?: 'rtl'
  className: string
}

/**
 * Attributes for user-authored text nodes / inputs.
 * Mixed strings get `dir="rtl"` so Unicode bidi word order matches RTL UI;
 * CSS keeps alignment tied to the document UI locale.
 */
export function userBidiAttrs(text: string, extraClassName?: string): UserBidiAttrs {
  const mixed = isMixedBidi(text)
  const base = mixed ? 'user-bidi user-bidi-mixed' : 'user-bidi'
  const className = extraClassName ? `${base} ${extraClassName}` : base
  return mixed ? { dir: 'rtl', className } : { className }
}
