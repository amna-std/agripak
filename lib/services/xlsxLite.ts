import { inflateRawSync } from "node:zlib"

/**
 * ---------------------------------------------------------------------------
 * xlsxLite — a read-only, dependency-free .xlsx reader
 * ---------------------------------------------------------------------------
 *
 * We need exactly one thing from Excel: the cell text of a worksheet in the
 * weekly PBS SPI annexure (see `pbsService.ts`). Pulling in `exceljs` or `xlsx`
 * for that would add megabytes to a Vercel lambda that already has a cold-start
 * budget to worry about, so this module does the small amount of work by hand.
 *
 * An .xlsx file is a ZIP archive of XML parts. Node ships everything required:
 * `zlib.inflateRawSync` for the DEFLATE payloads, and the ZIP container format
 * is simple enough to walk directly. We read the central directory (rather than
 * scanning for local file headers) because it is the only authoritative index —
 * local headers may carry zeroed sizes when a writer used a data descriptor.
 *
 * Deliberate limitations, all safe for the PBS files:
 *   - store (method 0) and deflate (method 8) only; no zip64, no encryption;
 *   - values are returned as raw strings, never coerced to number or Date;
 *   - formatting, merged-cell geometry and formulas are ignored — we only ever
 *     want the cached value a cell displays.
 */

/** Guard against a hostile or truncated download eating the lambda's memory. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50

/** True when the buffer starts with the ZIP local-file magic (`PK\x03\x04`). */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

/**
 * Locates the End Of Central Directory record.
 *
 * The EOCD sits at the very end of the file, but a trailing comment of up to
 * 65535 bytes may follow it, so we scan backwards over that window.
 */
function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 0xffff - 22)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  return -1
}

function readCentralDirectory(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error("Not a ZIP archive: no end-of-central-directory record")

  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)

  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== SIG_CENTRAL) break

    const nameLength = buf.readUInt16LE(offset + 28)
    const extraLength = buf.readUInt16LE(offset + 30)
    const commentLength = buf.readUInt16LE(offset + 32)

    entries.push({
      name: buf.toString("utf8", offset + 46, offset + 46 + nameLength),
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      uncompressedSize: buf.readUInt32LE(offset + 24),
      localHeaderOffset: buf.readUInt32LE(offset + 42),
    })

    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readEntry(buf: Buffer, entry: ZipEntry): string {
  const header = entry.localHeaderOffset
  if (header + 30 > buf.length) throw new Error(`Corrupt entry: ${entry.name}`)

  // The local header repeats the name and extra field, and its extra field
  // length routinely differs from the central directory's. Always trust the
  // local copy when computing where the payload actually begins.
  const nameLength = buf.readUInt16LE(header + 26)
  const extraLength = buf.readUInt16LE(header + 28)
  const start = header + 30 + nameLength + extraLength

  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new Error(`Entry too large to parse: ${entry.name}`)
  }

  const payload = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return payload.toString("utf8")
  if (entry.method === 8) return inflateRawSync(payload).toString("utf8")
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}`)
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decodeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    }
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
    return XML_ENTITIES[code] ?? whole
  })
}

/** Concatenates every `<t>` run in a fragment — how Excel stores rich text. */
function textRuns(fragment: string): string {
  let out = ""
  for (const match of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)) {
    out += decodeXml(match[1] ?? "")
  }
  return out
}

/** `xl/sharedStrings.xml` is one `<si>` per interned string, in index order. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) out.push(textRuns(match[1]))
  return out
}

/** Splits a cell reference such as `AB12` into its column letters. */
function columnOf(ref: string): string {
  let out = ""
  for (const ch of ref) {
    if (ch >= "0" && ch <= "9") break
    out += ch
  }
  return out
}

/** One spreadsheet row: column letter (`"A"`, `"AB"`) to trimmed cell text. */
export type SheetRow = Record<string, string>

/**
 * Reads one worksheet as rows of plain text, keyed by column letter.
 *
 * Rows are returned in document order with blanks preserved, so callers can
 * still reason about relative position; empty cells are simply absent from the
 * record rather than present as `""`.
 *
 * @param file          the raw .xlsx bytes
 * @param sheetIndex    zero-based worksheet position (`xl/worksheets/sheetN.xml`)
 */
export function readSheet(file: Buffer, sheetIndex = 0): SheetRow[] {
  const entries = readCentralDirectory(file)
  const byName = new Map(entries.map((e) => [e.name, e]))

  const sheetName = `xl/worksheets/sheet${sheetIndex + 1}.xml`
  const sheetEntry = byName.get(sheetName)
  if (!sheetEntry) throw new Error(`Worksheet not found: ${sheetName}`)

  const sharedEntry = byName.get("xl/sharedStrings.xml")
  const shared = sharedEntry ? parseSharedStrings(readEntry(file, sharedEntry)) : []

  const xml = readEntry(file, sheetEntry)
  const rows: SheetRow[] = []

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: SheetRow = {}

    for (const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1]
      const body = cellMatch[3] ?? ""

      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
      if (!ref) continue
      const type = /t="([^"]+)"/.exec(attrs)?.[1]

      let value: string
      if (type === "inlineStr") {
        value = textRuns(body)
      } else {
        const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1]
        if (raw == null) continue
        if (type === "s") {
          // A shared-string cell holds an index into the interned table.
          value = shared[Number.parseInt(decodeXml(raw), 10)] ?? ""
        } else {
          value = decodeXml(raw)
        }
      }

      const trimmed = value.replace(/\s+/g, " ").trim()
      if (trimmed) row[columnOf(ref)] = trimmed
    }

    rows.push(row)
  }

  return rows
}
