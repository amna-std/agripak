#!/usr/bin/env node
/**
 * Dead-endpoint guard.
 *
 * Catches frontend code calling an /api/... path that has no matching route
 * handler. This is a silent failure mode: the page still renders, the fetch just
 * 404s, and the user sees a permanent empty state. It happened three times
 * during the Pakistan rebuild (`/api/crop-guidance`, `/api/forum`, `/api/profile`).
 *
 * Comments are stripped before scanning, so a code comment that documents an old
 * removed endpoint does not trip it.
 *
 * Usage:  npm run check:api    (exits non-zero if a live reference is unmatched)
 */

import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()

/** Files that are intentionally not wired up; excluded from the check. */
const IGNORED_FILES = []

function walk(dir, exts) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full, exts))
    else if (exts.some((x) => e.name.endsWith(x))) out.push(full)
  }
  return out
}

/** Every route handler that actually exists, as a path like /api/weather/current. */
function definedRoutes() {
  return walk(path.join(ROOT, "app/api"), ["route.ts", "route.tsx", "route.js"]).map((f) =>
    "/" + path.relative(ROOT, path.dirname(f)).replace(/^app\//, ""),
  )
}

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const routes = definedRoutes()

/** A reference matches if segment counts line up and every non-[param] segment is equal. */
function matches(ref) {
  const rp = ref.split("/").filter(Boolean)
  return routes.some((r) => {
    const sp = r.split("/").filter(Boolean)
    return sp.length === rp.length && sp.every((s, i) => s.startsWith("[") || s === rp[i])
  })
}

const files = [
  ...walk(path.join(ROOT, "app"), [".tsx", ".ts"]),
  ...walk(path.join(ROOT, "components"), [".tsx", ".ts"]),
  ...walk(path.join(ROOT, "lib"), [".ts", ".tsx"]),
].filter((f) => !f.includes(`${path.sep}app${path.sep}api${path.sep}`))

const bad = new Map()
for (const file of files) {
  const rel = path.relative(ROOT, file)
  if (IGNORED_FILES.includes(rel)) continue
  const src = stripComments(fs.readFileSync(file, "utf8"))
  for (const m of src.matchAll(/["'`](\/api\/[a-zA-Z0-9_\-/[\]${}.]*)/g)) {
    // Template placeholders (`${id}`) stand in for a dynamic segment.
    const ref = m[1].replace(/\$\{[^}]+\}/g, "[x]").replace(/\?$/, "")
    if (ref === "/api" || ref === "/api/") continue
    if (!matches(ref)) {
      if (!bad.has(ref)) bad.set(ref, new Set())
      bad.get(ref).add(rel)
    }
  }
}

if (bad.size) {
  console.error(`\n✗ ${bad.size} API reference(s) with no matching route handler:\n`)
  for (const [ref, where] of [...bad].sort()) {
    console.error(`   ${ref}`)
    for (const f of where) console.error(`       called from ${f}`)
  }
  console.error("\napi-refs check FAILED\n")
  process.exit(1)
}

console.log(`✓ API refs OK — every /api/... call resolves to one of ${routes.length} route handlers`)
