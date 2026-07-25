#!/usr/bin/env node
/**
 * i18n guard.
 *
 * `translate()` falls back to returning the key itself when a lookup misses, so
 * a missing entry does not crash — it renders "advisor.subtitle" on screen where
 * a heading should be. That shipped once; this script exists so it cannot again.
 *
 * Checks two things:
 *   1. Every t("namespace.key") used in app/ or components/ exists in en.ts.
 *   2. Every locale (ur, pa, sd, ps) defines the same key set as en.ts.
 *
 * Usage:  npm run check:i18n     (exits non-zero on any problem)
 */

import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const TRANSLATIONS = path.join(ROOT, "lib/data/translations")
const LOCALES = ["en", "ur", "pa", "sd", "ps"]

/** Recursively collect .tsx files under a directory. */
function tsxFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(full))
    else if (entry.name.endsWith(".tsx")) out.push(full)
  }
  return out
}

/**
 * Parse `namespace.key` pairs out of a dictionary file.
 * The dictionaries are two levels deep: `ns: { key: "..." }`.
 */
function definedKeys(locale) {
  const file = path.join(TRANSLATIONS, `${locale}.ts`)
  const src = fs.readFileSync(file, "utf8")
  const keys = new Set()
  let ns = null
  for (const line of src.split("\n")) {
    const nsMatch = line.match(/^ {2}([a-zA-Z0-9_]+):\s*\{/)
    if (nsMatch) {
      ns = nsMatch[1]
      continue
    }
    if (/^ {2}\},?\s*$/.test(line)) {
      ns = null
      continue
    }
    const keyMatch = line.match(/^ {4}([a-zA-Z0-9_]+):/)
    if (keyMatch && ns) keys.add(`${ns}.${keyMatch[1]}`)
  }
  return keys
}

/** Collect every literal key passed to t(). */
function usedKeys() {
  const used = new Map()
  const files = [...tsxFiles(path.join(ROOT, "app")), ...tsxFiles(path.join(ROOT, "components"))]
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8")
    const re = /\bt\(\s*["']([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)["']/g
    let m
    while ((m = re.exec(src))) {
      if (!used.has(m.group ? m.group(1) : m[1])) used.set(m[1], new Set())
      used.get(m[1]).add(path.relative(ROOT, file))
    }
  }
  return used
}

const en = definedKeys("en")
const used = usedKeys()

let failed = false

// 1. keys used in components but never defined
const missing = [...used.keys()].filter((k) => !en.has(k)).sort()
if (missing.length) {
  failed = true
  console.error(`\n✗ ${missing.length} translation key(s) used in components but missing from en.ts:\n`)
  for (const key of missing) {
    console.error(`   ${key}`)
    for (const f of used.get(key)) console.error(`       used in ${f}`)
  }
}

// 2. locales out of sync with en
for (const locale of LOCALES.slice(1)) {
  const keys = definedKeys(locale)
  const absent = [...en].filter((k) => !keys.has(k)).sort()
  const extra = [...keys].filter((k) => !en.has(k)).sort()
  if (absent.length || extra.length) {
    failed = true
    console.error(`\n✗ ${locale}.ts is out of sync with en.ts`)
    if (absent.length) console.error(`   missing ${absent.length}: ${absent.slice(0, 12).join(", ")}${absent.length > 12 ? " …" : ""}`)
    if (extra.length) console.error(`   extra   ${extra.length}: ${extra.slice(0, 12).join(", ")}${extra.length > 12 ? " …" : ""}`)
  }
}

if (failed) {
  console.error("\ni18n check FAILED\n")
  process.exit(1)
}

console.log(`✓ i18n OK — ${used.size} keys used, ${en.size} defined, ${LOCALES.length} locales in sync`)
