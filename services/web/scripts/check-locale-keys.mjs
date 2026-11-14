#!/usr/bin/env node
/**
 * Fail if any locale under src/locales/<code>/ is missing keys present in en/.
 * Extra keys (e.g. Hebrew plural `_two`) are allowed.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesRoot = path.join(root, 'src', 'locales')

function flatten(obj, prefix = '') {
  /** @type {string[]} */
  const keys = []
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) keys.push(prefix)
    return keys
  }
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flatten(v, next))
    } else {
      keys.push(next)
    }
  }
  return keys
}

async function loadNamespace(locale, file) {
  const raw = await readFile(path.join(localesRoot, locale, file), 'utf8')
  return JSON.parse(raw)
}

async function main() {
  const locales = (await readdir(localesRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  if (!locales.includes('en')) {
    console.error('Missing baseline locale: en')
    process.exit(1)
  }

  const enFiles = (await readdir(path.join(localesRoot, 'en')))
    .filter((f) => f.endsWith('.json'))
    .sort()

  let missing = 0
  for (const locale of locales) {
    if (locale === 'en') continue
    const localeFiles = new Set(
      (await readdir(path.join(localesRoot, locale))).filter((f) =>
        f.endsWith('.json'),
      ),
    )
    for (const file of enFiles) {
      if (!localeFiles.has(file)) {
        console.error(`[${locale}] missing namespace file: ${file}`)
        missing += 1
        continue
      }
      const enKeys = new Set(flatten(await loadNamespace('en', file)))
      const locKeys = new Set(flatten(await loadNamespace(locale, file)))
      for (const key of enKeys) {
        if (!locKeys.has(key)) {
          console.error(`[${locale}] missing key ${file} → ${key}`)
          missing += 1
        }
      }
    }
  }

  if (missing > 0) {
    console.error(`\nLocale key check failed: ${missing} missing key(s).`)
    process.exit(1)
  }
  console.log(
    `Locale key check OK (${locales.filter((l) => l !== 'en').join(', ') || 'no extra locales'} vs en; ${enFiles.length} namespaces).`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
