import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDatePart(d, format) {
  const day = pad2(d.getDate())
  const month = pad2(d.getMonth() + 1)
  const year = String(d.getFullYear())
  if (format === 'MM/DD/YYYY') return `${month}/${day}/${year}`
  if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`
  return `${day}/${month}/${year}`
}

function parseDateParts(datePart, dateFormat) {
  if (dateFormat === 'YYYY-MM-DD') {
    const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) return null
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  }
  const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  const year = Number(m[3])
  if (dateFormat === 'MM/DD/YYYY') return { year, month: a, day: b }
  return { year, month: b, day: a }
}

function parseTimeParts(timePart, timeFormat) {
  const trimmed = timePart.trim()
  const h24 = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) {
    const hours = Number(h24[1])
    const minutes = Number(h24[2])
    if (hours > 23 || minutes > 59) return null
    return { hours, minutes }
  }
  if (timeFormat !== '12h') return null
  const h12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/)
  if (!h12) return null
  let hours = Number(h12[1])
  const minutes = Number(h12[2])
  if (hours < 1 || hours > 12 || minutes > 59) return null
  const ampm = h12[3].toUpperCase()
  if (ampm === 'AM') {
    if (hours === 12) hours = 0
  } else if (hours !== 12) {
    hours += 12
  }
  return { hours, minutes }
}

function parseDateTimeInput(text, dateFormat, timeFormat) {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (!cleaned) return null
  const match = cleaned.match(/^(.+?)\s+(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)$/)
  if (!match) return null
  const parts = parseDateParts(match[1], dateFormat)
  const time = parseTimeParts(match[2], timeFormat)
  if (!parts || !time) return null
  const d = new Date(parts.year, parts.month - 1, parts.day, time.hours, time.minutes, 0, 0)
  if (
    d.getFullYear() !== parts.year ||
    d.getMonth() !== parts.month - 1 ||
    d.getDate() !== parts.day
  ) {
    return null
  }
  return d
}

describe('preference datetime parse/format', () => {
  it('round-trips DD/MM/YYYY 24h', () => {
    const d = parseDateTimeInput('19/11/2026 14:30', 'DD/MM/YYYY', '24h')
    assert.ok(d)
    assert.equal(formatDatePart(d, 'DD/MM/YYYY'), '19/11/2026')
    assert.equal(d.getHours(), 14)
    assert.equal(d.getMinutes(), 30)
  })

  it('parses MM/DD/YYYY and 12h', () => {
    const d = parseDateTimeInput('11/19/2026 2:30 PM', 'MM/DD/YYYY', '12h')
    assert.ok(d)
    assert.equal(d.getMonth(), 10)
    assert.equal(d.getDate(), 19)
    assert.equal(d.getHours(), 14)
  })

  it('rejects impossible calendar days', () => {
    assert.equal(parseDateTimeInput('31/02/2026 10:00', 'DD/MM/YYYY', '24h'), null)
  })
})
