import assert from 'node:assert/strict'

/** Mirror of services/web/src/lib/bidi.ts — keep in sync when changing detection. */
const STRONG_RTL =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
const STRONG_LTR = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/

function isMixedBidi(text) {
  return STRONG_RTL.test(text) && STRONG_LTR.test(text)
}

assert.equal(isMixedBidi('hello'), false)
assert.equal(isMixedBidi('שלום'), false)
assert.equal(isMixedBidi('שלום 123'), false)
assert.equal(isMixedBidi('APOLLO'), false)
assert.equal(isMixedBidi('בדוק את APOLLO בבקשה'), true)
assert.equal(isMixedBidi('Check שלום please'), true)
assert.equal(isMixedBidi(''), false)
assert.equal(isMixedBidi('123 !!!'), false)

console.log('check-bidi: ok')
