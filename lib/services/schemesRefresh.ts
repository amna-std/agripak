/**
 * ---------------------------------------------------------------------------
 * AgriPak — self-updating government scheme data
 * ---------------------------------------------------------------------------
 *
 * WHY THIS EXISTS
 * ---------------
 * `lib/data/pakistan-schemes.ts` is hand-researched and accurate on the day it
 * was written. It is also, by construction, a snapshot: loan ceilings get
 * revised, application rounds close, phases reopen. A farmer arriving in a
 * year's time must not be shown a Rs 150,000 limit that became Rs 300,000, nor
 * be told to apply to a window that shut eight months ago.
 *
 * So the curated file is the TRUSTED BASELINE and never the whole truth. This
 * module re-checks it against the live web and stores a corrected overlay in
 * MongoDB. Serving prefers the overlay; if the overlay is missing, stale or
 * unreadable, the baseline is served unchanged. There is no state in which the
 * schemes page is empty.
 *
 * THE CITATION RULE (the important part)
 * --------------------------------------
 * An LLM asked "what is the current loan limit" will happily produce a
 * confident rupee figure with no source whatsoever. During development,
 * `gemini-flash-latest` was asked for the Green Tractor subsidy in a JSON
 * envelope and returned a figure, a status and a date having performed **zero**
 * searches — `groundingMetadata` came back empty. The number happened to be
 * right. That is precisely the problem: it was indistinguishable from a guess.
 *
 * Every defence in this file follows from that observation:
 *
 *   1. Research runs as PROSE, not JSON. Empirically the model only invokes the
 *      google_search tool when asked an open question; wrapping the request in
 *      an output schema makes it answer from memory instead. Stage A is
 *      therefore a plain question, and stage B (no tools) extracts structure
 *      from Stage A's own text.
 *   2. NO GROUNDING, NO WRITE. If Stage A returns without `groundingChunks`,
 *      the model did not actually look anything up, so the scheme is left alone
 *      and `lastVerified` is NOT advanced — we will not claim to have checked
 *      something we did not check.
 *   3. CITATIONS MUST BE REAL URLS THE MODEL ACTUALLY SAW. Accepted source URLs
 *      are resolved from the grounding redirects returned by the API, and a
 *      change is only applied if its `sourceUrl` is an exact match for one of
 *      them. The model cannot cite a page that was not in its search results,
 *      which makes a fabricated citation structurally impossible rather than
 *      merely discouraged.
 *   4. DOMAIN TIERS. Grounded is not the same as trustworthy — a real search
 *      for this scheme returned youtube.com and `cmgreentractor.online`, a
 *      lookalike aggregator, alongside agripunjab.gov.pk. Money may only be
 *      changed on an official government/central-bank/state-bank domain;
 *      status and dates additionally accept established Pakistani newspapers;
 *      everything else is discarded.
 *   5. NARROW BLAST RADIUS. Only the six volatile fields in `FIELD_POLICY` can
 *      be overwritten. `eligibilityRules` drives the eligibility matcher and is
 *      never model-writable, and neither are the benefits, documents or
 *      descriptions — a wrong figure is bad, silently corrupted eligibility
 *      logic is worse.
 *   6. MONEY MOVES AS A PAIR. `benefitAmount` is only accepted together with a
 *      cited `benefitAmountLabel`, so the headline number and the sentence
 *      explaining it can never disagree in the UI.
 *
 * Anything that fails a check is not stored. It is returned in `rejected[]`
 * with the reason, so a human can look at what the model wanted to do.
 *
 * THE OVERLAY IS REBUILT, NOT ACCUMULATED
 * ---------------------------------------
 * Each run recomputes a scheme's stored record as `curated baseline + changes
 * cited by THIS run`. Edits do not pile up on top of each other. The trade-off
 * is deliberate and worth knowing about:
 *
 *   - A correction only survives while the evidence for it keeps being found.
 *     A genuine fix can revert if the next run's search does not resurface the
 *     page that justified it. Observed in practice: a Rs 2,000,000-per-tubewell
 *     figure from a Press Information Department release was applied on one run
 *     and absent from the next, because that release was not retrieved again.
 *   - In exchange, nothing model-written ever becomes permanent behind our
 *     backs. There is no path by which a bad edit survives because a later run
 *     failed to contradict it, and no drift away from the human-checked file.
 *     Every stored value is either hand-verified or backed by a citation
 *     collected minutes earlier.
 *
 * For data a farmer may act on, occasional reversion to a hand-checked value is
 * the better failure. Making a correction sticky would mean trusting a citation
 * nobody can re-verify.
 */

import { PAKISTAN_SCHEMES, type Scheme, type SchemeStatus } from "@/lib/data/pakistan-schemes"
import { connectDB } from "@/lib/db"
import GovernmentScheme from "@/lib/models/GovernmentScheme"

/* ------------------------------------------------------------------ config */

export const REFRESH_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest"

const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

/**
 * Per-call ceilings. The route runs under a 60s Vercel maxDuration.
 *
 * Research is generous because grounded calls fan out into several searches —
 * the Kissan Card check issues five or six and reliably exceeded 25s.
 */
const RESEARCH_TIMEOUT_MS = 30_000
/** Extraction reasons over a long prompt; 15s proved too tight under load. */
const EXTRACT_TIMEOUT_MS = 20_000
const RESOLVE_TIMEOUT_MS = 6_000
const OFFICIAL_FETCH_TIMEOUT_MS = 8_000
/** Enough of the official page to carry its status notice, without bloating the prompt. */
const OFFICIAL_PAGE_CHARS = 4_000

/**
 * Don't start another scheme unless this much budget is left. Starting one with
 * less is not harmful — every call is clamped to the remaining time — but below
 * this the research call gets too short to return anything useful.
 */
const PER_SCHEME_RESERVE_MS = 20_000

/**
 * Government, central-bank and state-owned-bank domains. A rupee figure may
 * only be changed on the strength of one of these.
 */
const OFFICIAL_SUFFIXES = [
  ".gov.pk",
  ".gos.pk",
  ".gop.pk",
  ".gob.pk",
  ".gokp.pk",
  ".org.pk",
]

const OFFICIAL_HOSTS = new Set([
  "sbp.org.pk",
  "ztbl.com.pk",
  "bop.com.pk",
  "sindhbank.com.pk",
  "nbp.com.pk",
  "pakistan.gov.pk",
])

/**
 * Established Pakistani outlets. Good enough to tell us a round has closed or
 * a phase has opened; NOT good enough on their own to rewrite a rupee amount.
 */
const NEWS_HOSTS = new Set([
  "dawn.com",
  "tribune.com.pk",
  "thenews.com.pk",
  "brecorder.com",
  "businessrecorder.com.pk",
  "app.com.pk",
  "arynews.tv",
  "geo.tv",
  "nation.com.pk",
  "pakistantoday.com.pk",
  "profit.pakistantoday.com.pk",
  "dunyanews.tv",
  "samaa.tv",
  "bolnews.com",
  "thefridaytimes.com",
  "pkrevenue.com",
  "propakistani.pk",
  "minutemirror.com.pk",
  "dailytimes.com.pk",
  "24newshd.tv",
])

export type SourceTier = "official" | "news" | "untrusted"

/** Which stored fields the refresh may overwrite, and what it takes to do so. */
const FIELD_POLICY = {
  status: { tier: "news", kind: "status" },
  benefitAmount: { tier: "official", kind: "money" },
  benefitAmountLabel: { tier: "official", kind: "text" },
  applicationWindow: { tier: "news", kind: "text" },
  helpline: { tier: "official", kind: "text" },
  officialUrl: { tier: "official", kind: "url" },
} as const

export type RefreshableField = keyof typeof FIELD_POLICY

const REFRESHABLE_FIELDS = Object.keys(FIELD_POLICY) as RefreshableField[]

const VALID_STATUSES: SchemeStatus[] = ["active", "closed", "upcoming"]

/** No published Pakistani farm scheme has a headline value above this. */
const MAX_BENEFIT_PKR = 50_000_000

/* ------------------------------------------------------------------- types */

export interface AcceptedChange {
  schemeId: string
  field: RefreshableField
  oldValue: unknown
  newValue: unknown
  sourceUrl: string
  sourceDate: string
  sourceTier: SourceTier
  quote: string
}

export interface RejectedChange {
  schemeId: string
  field: string
  proposedValue: unknown
  sourceUrl: string | null
  reason: string
}

export interface SchemeRefreshOutcome {
  schemeId: string
  name: string
  /** True when Gemini actually performed a web search on this turn. */
  grounded: boolean
  /** True when the scheme's own official page was fetched and given as evidence. */
  officialPageRead: boolean
  searchQueries: string[]
  sourcesSeen: string[]
  applied: AcceptedChange[]
  rejected: RejectedChange[]
  /** Claims the researcher made that the extractor could not attach to a source. */
  uncited: string[]
  lastVerified: string | null
  error: string | null
}

export interface RefreshReport {
  ok: boolean
  model: string
  startedAt: string
  finishedAt: string
  durationMs: number
  dryRun: boolean
  checked: number
  skippedForTime: string[]
  changesApplied: number
  changesRejected: number
  persisted: number
  persistError: string | null
  schemes: SchemeRefreshOutcome[]
}

/* -------------------------------------------------------------- small utils */

/** Today as YYYY-MM-DD, UTC. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" && u.protocol !== "http:") return null
    return u.hostname.replace(/^www\./i, "").toLowerCase()
  } catch {
    return null
  }
}

/** Classifies a URL into the tier that decides what it is allowed to change. */
export function tierOf(url: string): SourceTier {
  const host = hostOf(url)
  if (!host) return "untrusted"
  if (OFFICIAL_HOSTS.has(host)) return "official"
  if (OFFICIAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "official"
  if (NEWS_HOSTS.has(host)) return "news"
  // Accept a subdomain of a trusted news host (e.g. profit.pakistantoday.com.pk).
  for (const newsHost of NEWS_HOSTS) {
    if (host.endsWith(`.${newsHost}`)) return "news"
  }
  return "untrusted"
}

function tierSatisfies(actual: SourceTier, required: "official" | "news"): boolean {
  if (required === "official") return actual === "official"
  return actual === "official" || actual === "news"
}

/** Trims, collapses whitespace and strips control characters. */
function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[ -]/g, " ").replace(/\s+/g, " ").trim()
  if (!cleaned || cleaned.length > maxLength) return null
  return cleaned
}

/** Runs `tasks` with bounded concurrency, preserving result order. */
async function pool<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await task(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/* ------------------------------------------------------------ gemini client */

export class RefreshNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set, so scheme data cannot be re-verified. Serving the curated baseline unchanged.")
    this.name = "RefreshNotConfiguredError"
  }
}

/** Raised when `schemeIds` matches nothing, so the caller sees a 400 not a 502. */
export class UnknownSchemeError extends Error {
  constructor(requested: string[]) {
    super(`No scheme matched: ${requested.join(", ")}. Call GET /api/schemes for valid ids.`)
    this.name = "UnknownSchemeError"
  }
}

export function isRefreshConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

/** Never let the key leak into a report, a log line or an HTTP response. */
function redact(text: string): string {
  const key = process.env.GEMINI_API_KEY
  let out = text
  if (key && key.length > 8) out = out.split(key).join("[redacted]")
  return out.replace(/key=[A-Za-z0-9_\-]+/gi, "key=[redacted]")
}

interface GeminiCall {
  prompt: string
  /** Enables the google_search grounding tool. */
  search: boolean
  timeoutMs: number
  json?: boolean
}

interface GeminiResult {
  text: string
  /** Vertex redirect URLs for the pages the model actually read. */
  groundingUris: string[]
  searchQueries: string[]
}

async function callGemini({ prompt, search, timeoutMs, json }: GeminiCall): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new RefreshNotConfiguredError()

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  }
  // The grounding tool and a forced JSON mime type are mutually exclusive in
  // practice, which is the other reason research and extraction are separate.
  if (search) body.tools = [{ google_search: {} }]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(GEMINI_ENDPOINT(REFRESH_MODEL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(`Gemini timed out after ${timeoutMs}ms`)
    throw new Error(redact(`Gemini request failed: ${error?.message ?? String(error)}`))
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(redact(`Gemini returned HTTP ${response.status}: ${detail.slice(0, 300)}`))
  }

  const payload: any = await response.json().catch(() => null)
  if (!payload || payload.error) {
    throw new Error(redact(`Gemini returned an error: ${JSON.stringify(payload?.error ?? {}).slice(0, 300)}`))
  }

  const candidate = payload.candidates?.[0]
  const text: string = (candidate?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")

  const metadata = candidate?.groundingMetadata ?? {}
  const groundingUris: string[] = (metadata.groundingChunks ?? [])
    .map((chunk: any) => chunk?.web?.uri)
    .filter((uri: unknown): uri is string => typeof uri === "string" && uri.length > 0)

  return {
    text,
    groundingUris,
    searchQueries: Array.isArray(metadata.webSearchQueries) ? metadata.webSearchQueries : [],
  }
}

/**
 * Turns a Vertex grounding redirect into the real article URL.
 *
 * The API hands back opaque `vertexaisearch.cloud.google.com/...` links that
 * expire. We follow one hop to recover the true URL, because that is what gets
 * stored in `sources` and shown to the farmer on the scheme detail page — and
 * because the domain is what decides whether a change is allowed at all.
 */
async function resolveGroundingUri(uri: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS)
  try {
    const response = await fetch(uri, { method: "GET", redirect: "manual", signal: controller.signal })
    const location = response.headers.get("location")
    if (location && /^https?:\/\//i.test(location)) return location.split("#")[0]
    // Some chunks are already direct links.
    if (!/vertexaisearch\.cloud\.google\.com/i.test(uri)) return uri
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetches the scheme's own official page and reduces it to plain text.
 *
 * Grounding search is not reliable enough to surface the page that matters
 * most. Checking the Green Tractor scheme, search returned agripunjab.gov.pk,
 * two YouTube videos and a real-estate blog — but never gts.punjab.gov.pk,
 * whose front page says in as many words "We are not accepting any new
 * applications". The model duly worked out the scheme was closed and then
 * discarded its own conclusion, because it had no permitted URL to cite it to.
 *
 * A human checking a scheme opens the official page first, so we do that too:
 * one GET, handed to the model as evidence and added to the allowed citation
 * list. It is the most authoritative source available and the only one
 * guaranteed to be current, which makes "is this still open?" answerable
 * without depending on what search happened to return.
 */
async function fetchOfficialPageText(url: string): Promise<string | null> {
  if (tierOf(url) !== "official") return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OFFICIAL_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "AgriPak-SchemeVerifier/1.0 (+scheme data accuracy check)" },
    })
    if (!response.ok) return null
    const contentType = response.headers.get("content-type") ?? ""
    if (!/text\/html|text\/plain/i.test(contentType)) return null

    const html = await response.text()
    const text = html
      .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#\d+;/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    return text ? text.slice(0, OFFICIAL_PAGE_CHARS) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ prompts */

/**
 * Stage A — open-ended research.
 *
 * Deliberately prose. Asking for JSON here suppresses the search tool (see the
 * header comment), and an ungrounded answer is worthless to us.
 */
function researchPrompt(scheme: Scheme, officialPageText: string | null): string {
  return [
    `Today's date is ${today()}. You are checking whether a Pakistani government agriculture scheme's published details are still current.`,
    "",
    `Search the web now for the latest information about: "${scheme.name}" (${scheme.province}, Pakistan).`,
    `Official page on record: ${scheme.officialUrl}`,
    "",
    ...(officialPageText
      ? [
          `=== LIVE TEXT OF ${scheme.officialUrl}, RETRIEVED TODAY (${today()}) ===`,
          officialPageText,
          "=== END OF OFFICIAL PAGE ===",
          "",
          "That official page was fetched today and outranks anything else you find. If it carries a notice about whether applications are being accepted, treat it as decisive and quote it.",
          "But absence of information on that page proves nothing. Some of these URLs are broad ministry or department homepages that never mention this particular scheme. If the page does not discuss the scheme, say so and ignore it — do NOT conclude the scheme has closed, changed or ended merely because a page does not mention it.",
          "",
        ]
      : []),
    "Here is what we currently have on file:",
    `- status: ${scheme.status}`,
    `- headline benefit amount (PKR): ${scheme.benefitAmount ?? "not published"}`,
    `- headline benefit description: ${scheme.benefitAmountLabel}`,
    `- application window: ${scheme.applicationWindow ?? "not recorded"}`,
    `- helpline: ${scheme.helpline ?? "not recorded"}`,
    "",
    "Answer these questions using what you find in search results:",
    "1. Is the scheme accepting applications RIGHT NOW? Answer with exactly one of: active (open now), closed (not accepting), upcoming (announced, not yet open). If the official portal displays a notice about whether it is accepting applications, quote that notice word for word.",
    "2. Has the loan limit, subsidy amount or grant amount changed? State the current figure in rupees.",
    "3. Is there a new phase, a new application deadline, or a new round?",
    "4. Is the official URL and helpline still correct?",
    "5. Has the scheme been discontinued, renamed, merged or replaced?",
    "",
    "For every source you rely on, give: the full URL, the site name, and the publication or last-updated date in YYYY-MM-DD form. If it is a live portal page with no publication date, write the date as today's date and note that you retrieved it today.",
    "",
    "Rules: rely only on pages you retrieve in this search. Quote the sentence that supports each figure and name the site it came from. If search does not settle a point, say so plainly instead of filling the gap from memory. Prefer Pakistani government sites and established newspapers, and say explicitly when a claim comes only from an unofficial blog or aggregator site.",
  ].join("\n")
}

/**
 * Stage B — structured extraction, tools disabled.
 *
 * The model may only cite from `allowedSources`, which are the pages Stage A
 * genuinely retrieved. That is what makes an invented citation impossible.
 */
function extractionPrompt(scheme: Scheme, research: string, allowedSources: string[]): string {
  const sourceList = allowedSources.map((url, i) => `[${i + 1}] ${url}`).join("\n")

  return [
    `Today's date is ${today()}. Convert the research notes below into JSON. Do not add knowledge of your own — the notes and the source list are the only permitted inputs.`,
    "",
    "=== CURRENT STORED VALUES ===",
    JSON.stringify(
      {
        status: scheme.status,
        benefitAmount: scheme.benefitAmount,
        benefitAmountLabel: scheme.benefitAmountLabel,
        applicationWindow: scheme.applicationWindow ?? null,
        helpline: scheme.helpline ?? null,
        officialUrl: scheme.officialUrl,
      },
      null,
      2,
    ),
    "",
    "=== RESEARCH NOTES ===",
    research,
    "",
    "=== SOURCE URLS THAT MAY BE CITED ===",
    sourceList || "(none)",
    "",
    "=== OUTPUT ===",
    'Return JSON: {"changes":[{"field":string,"newValue":any,"sourceUrl":string,"sourceDate":"YYYY-MM-DD","quote":string}],"unchanged":[string],"uncited":[string]}',
    "",
    "Work through the status field first:",
    `- The notes describe whether applications are open. Stored status is "${scheme.status}".`,
    "- If the notes say the window has closed, the deadline has passed, or the portal is not accepting applications, the correct status is \"closed\".",
    "- If the notes say a round is open now, the correct status is \"active\". If it is announced but not yet open, \"upcoming\".",
    "- If that answer differs from the stored status, it belongs in \"changes\" — cite the page that says so. Do not leave it out just because the wording was indirect.",
    "",
    "Rules:",
    `- "field" must be one of: ${REFRESHABLE_FIELDS.join(", ")}.`,
    "- Only list a field under \"changes\" if the notes show the stored value is now WRONG. If it still matches, put the field name in \"unchanged\".",
    "- If a source is a live portal page with no publication date, use today's date as its sourceDate.",
    "- \"sourceUrl\" MUST be copied character-for-character from the SOURCE URLS list above. Never write a URL that is not in that list. A change with no usable source URL does not belong in \"changes\" — describe it in \"uncited\" instead.",
    "- \"sourceDate\" is the publication or last-updated date of that source, as YYYY-MM-DD. If the notes do not give one, the change belongs in \"uncited\".",
    "- \"quote\" must be text that actually appears on the cited page, copied word for word. It is checked against the page. Your own reasoning, a summary, or an observation about what a page does NOT say is not a quote and will be discarded.",
    "- Never infer a change from silence. A page that does not mention the scheme is not evidence that anything about it has changed.",
    "- benefitAmount must be a plain integer in rupees with no separators or units, and must be accompanied by a benefitAmountLabel change in the same response.",
    "- status must be exactly \"active\", \"closed\" or \"upcoming\".",
    "- Put anything you believe but cannot attach to a listed source in \"uncited\". Leaving something out is always better than guessing.",
  ].join("\n")
}

/* ---------------------------------------------------------------- validation */

function parseJsonLoose(text: string): any | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1], trimmed].filter((value): value is string => typeof value === "string")

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      const start = candidate.indexOf("{")
      const end = candidate.lastIndexOf("}")
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1))
        } catch {
          /* fall through */
        }
      }
    }
  }
  return null
}

/** A source date must exist, parse, and not be from the future. */
function validSourceDate(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.trim().slice(0, 10) : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const parsed = Date.parse(`${text}T00:00:00Z`)
  if (Number.isNaN(parsed)) return null
  // One day of slack for timezone skew; nothing older than ten years.
  if (parsed > Date.now() + 86_400_000) return null
  if (parsed < Date.now() - 10 * 365 * 86_400_000) return null
  return text
}

interface ValidationContext {
  scheme: Scheme
  allowedSources: Set<string>
  /** Field names already accepted in this pass, for the money-pair rule. */
  proposedFields: Set<string>
  /** Text of the scheme's official page, when we fetched it this run. */
  officialPageText: string | null
}

/** Lowercase, letters and digits only — survives punctuation and reflowing. */
function normaliseForQuoteMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/**
 * For the one source whose full text we hold — the official page we fetched
 * ourselves — check the model's `quote` really appears on it.
 *
 * This closes the last gap in the citation rule. A change can otherwise carry a
 * genuine, official, trusted URL and still be worthless, because the "quote"
 * is the model's own inference rather than anything the page says. A real run
 * produced exactly that: it marked the Balochistan tubewell programme "closed"
 * against power.gov.pk, quoting *"the official portal text ... does not display
 * any public application notice or form."* That is an argument from absence
 * about a ministry homepage that never mentioned the scheme, and it would have
 * told farmers a live programme had ended.
 *
 * Verbatim-or-rejected. Absence of evidence is not evidence.
 */
function quoteAppearsOnPage(quote: string, pageText: string): boolean {
  const needle = normaliseForQuoteMatch(quote)
  if (needle.length < 15) return false
  const haystack = normaliseForQuoteMatch(pageText)
  // Match on a prefix so light truncation or an appended "..." still passes.
  return haystack.includes(needle.slice(0, Math.min(needle.length, 70)))
}

type ValidationResult = { ok: true; change: AcceptedChange } | { ok: false; rejected: RejectedChange }

function validateChange(raw: any, ctx: ValidationContext): ValidationResult {
  const { scheme, allowedSources, proposedFields, officialPageText } = ctx
  const field = typeof raw?.field === "string" ? raw.field.trim() : ""
  const sourceUrl = typeof raw?.sourceUrl === "string" ? raw.sourceUrl.trim() : ""

  const reject = (reason: string): ValidationResult => ({
    ok: false,
    rejected: {
      schemeId: scheme.id,
      field: field || "(missing)",
      proposedValue: raw?.newValue ?? null,
      sourceUrl: sourceUrl || null,
      reason,
    },
  })

  if (!REFRESHABLE_FIELDS.includes(field as RefreshableField)) {
    return reject(`"${field}" is not a refreshable field — only ${REFRESHABLE_FIELDS.join(", ")} may be updated.`)
  }
  const policy = FIELD_POLICY[field as RefreshableField]

  /* --- the citation gate ------------------------------------------------- */
  if (!sourceUrl) return reject("No source URL supplied.")
  if (!allowedSources.has(sourceUrl)) {
    return reject("Source URL was not among the pages the model actually retrieved — possible fabricated citation.")
  }

  const tier = tierOf(sourceUrl)
  if (tier === "untrusted") {
    return reject(`Source ${hostOf(sourceUrl)} is not a government or established news domain.`)
  }
  if (!tierSatisfies(tier, policy.tier)) {
    return reject(
      `Changing "${field}" requires an official government source; ${hostOf(sourceUrl)} is a news source only.`,
    )
  }

  const sourceDate = validSourceDate(raw?.sourceDate)
  if (!sourceDate) return reject("Missing or implausible source date.")

  /* --- quote must be real, where we can check it ------------------------- */
  const quote = cleanText(raw?.quote, 400) ?? ""
  if (sourceUrl === scheme.officialUrl && officialPageText) {
    if (!quote) return reject("No quote supplied for a claim about the official page.")
    if (!quoteAppearsOnPage(quote, officialPageText)) {
      return reject(
        "The quoted text does not appear on the official page that was fetched — the citation supports an inference, not a statement on the page.",
      )
    }
  }

  /* --- value checks ------------------------------------------------------ */
  const oldValue = (scheme as any)[field] ?? null
  let newValue: unknown

  switch (policy.kind) {
    case "status": {
      const value = typeof raw?.newValue === "string" ? raw.newValue.trim().toLowerCase() : ""
      if (!VALID_STATUSES.includes(value as SchemeStatus)) {
        return reject(`"${raw?.newValue}" is not a valid status.`)
      }
      newValue = value
      break
    }
    case "money": {
      const numeric =
        typeof raw?.newValue === "number"
          ? raw.newValue
          : typeof raw?.newValue === "string"
            ? Number(raw.newValue.replace(/[,\s_]/g, ""))
            : Number.NaN
      if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_BENEFIT_PKR) {
        return reject(`"${raw?.newValue}" is not a plausible PKR amount.`)
      }
      // Money only moves alongside the sentence that explains it.
      if (!proposedFields.has("benefitAmountLabel")) {
        return reject("A benefitAmount change must be accompanied by a cited benefitAmountLabel change.")
      }
      newValue = Math.round(numeric)
      break
    }
    case "url": {
      const value = cleanText(raw?.newValue, 300)
      if (!value || !/^https:\/\//i.test(value)) return reject("Replacement URL must be an absolute https URL.")
      if (tierOf(value) !== "official") return reject("A scheme's official URL must be on a government domain.")
      newValue = value
      break
    }
    default: {
      const value = cleanText(raw?.newValue, 400)
      if (!value) return reject("Empty or over-long text value.")
      newValue = value
      break
    }
  }

  if (field === "benefitAmountLabel" && !proposedFields.has("benefitAmount")) {
    // A label rewrite on its own is cosmetic churn against a curated sentence.
    return reject("benefitAmountLabel may only change together with a cited benefitAmount change.")
  }

  if (JSON.stringify(newValue) === JSON.stringify(oldValue)) {
    return reject("Proposed value is identical to the stored value.")
  }

  return {
    ok: true,
    change: {
      schemeId: scheme.id,
      field: field as RefreshableField,
      oldValue,
      newValue,
      sourceUrl,
      sourceDate,
      sourceTier: tier,
      quote,
    },
  }
}

/* ------------------------------------------------------------ per-scheme run */

/**
 * @param deadline Absolute timestamp this scheme must be finished by. Every
 *   network call is clamped to the time actually left, because a Vercel
 *   function that overruns `maxDuration` is killed mid-flight and returns
 *   nothing at all — a partial report beats no report.
 */
async function refreshOneScheme(scheme: Scheme, deadline: number): Promise<SchemeRefreshOutcome> {
  /** Time left, minus a little headroom to build and return the response. */
  const remaining = () => deadline - Date.now()
  const budgetFor = (ceiling: number, reserve: number) => Math.min(ceiling, Math.max(0, remaining() - reserve))

  const outcome: SchemeRefreshOutcome = {
    schemeId: scheme.id,
    name: scheme.name,
    grounded: false,
    officialPageRead: false,
    searchQueries: [],
    sourcesSeen: [],
    applied: [],
    rejected: [],
    uncited: [],
    lastVerified: null,
    error: null,
  }

  /* Read the scheme's own page first — see `fetchOfficialPageText`. */
  const officialPageText = await fetchOfficialPageText(scheme.officialUrl)
  outcome.officialPageRead = Boolean(officialPageText)

  /* Stage A — grounded research. Extraction still needs its own slice. */
  const researchBudget = budgetFor(RESEARCH_TIMEOUT_MS, EXTRACT_TIMEOUT_MS)
  if (researchBudget < 5_000) {
    outcome.error = "Ran out of time budget before this scheme could be checked."
    return outcome
  }

  let research: GeminiResult
  try {
    research = await callGemini({
      prompt: researchPrompt(scheme, officialPageText),
      search: true,
      timeoutMs: researchBudget,
    })
  } catch (error: any) {
    outcome.error = error?.message ?? String(error)
    return outcome
  }

  outcome.searchQueries = research.searchQueries

  if (research.groundingUris.length === 0) {
    // The model answered from memory. We have no evidence it checked anything,
    // so nothing is written and lastVerified stays where it was.
    outcome.error = "Model returned no grounding metadata — no web search was actually performed, so nothing was changed."
    return outcome
  }
  outcome.grounded = true

  /* Recover the real URLs behind the grounding redirects. */
  const resolved = await pool(research.groundingUris.slice(0, 12), 6, resolveGroundingUri)
  const allowedSources = Array.from(
    new Set([
      // The official page is citable because we fetched it ourselves this run,
      // so the "must have actually seen it" guarantee still holds.
      ...(officialPageText ? [scheme.officialUrl] : []),
      ...resolved.filter((url): url is string => typeof url === "string" && Boolean(hostOf(url))),
    ]),
  )
  outcome.sourcesSeen = allowedSources

  if (allowedSources.length === 0) {
    outcome.error = "Could not resolve any grounding citation to a real URL — nothing was changed."
    return outcome
  }

  // The search happened and we could see what it read: this counts as a check
  // even if nothing turns out to need changing.
  outcome.lastVerified = today()

  /* Stage B — extraction, no tools. */
  const extractBudget = budgetFor(EXTRACT_TIMEOUT_MS, 1_500)
  if (extractBudget < 3_000) {
    // The check itself happened, so `lastVerified` above stands; we simply
    // could not process the findings this run.
    outcome.error = "Ran out of time budget before the findings could be extracted — no changes were applied."
    return outcome
  }

  let extraction: GeminiResult
  try {
    extraction = await callGemini({
      prompt: extractionPrompt(scheme, research.text, allowedSources),
      search: false,
      timeoutMs: extractBudget,
      json: true,
    })
  } catch (error: any) {
    outcome.error = error?.message ?? String(error)
    return outcome
  }

  const parsed = parseJsonLoose(extraction.text)
  if (!parsed || typeof parsed !== "object") {
    outcome.error = "Extraction step did not return usable JSON — nothing was changed."
    return outcome
  }

  outcome.uncited = Array.isArray(parsed.uncited)
    ? parsed.uncited.map((item: unknown) => cleanText(item, 300)).filter((v: string | null): v is string => Boolean(v))
    : []

  const rawChanges: any[] = Array.isArray(parsed.changes) ? parsed.changes.slice(0, 12) : []
  const proposedFields = new Set<string>(
    rawChanges.map((change) => (typeof change?.field === "string" ? change.field.trim() : "")),
  )
  const allowedSet = new Set(allowedSources)

  const seenFields = new Set<string>()
  for (const rawChange of rawChanges) {
    const result = validateChange(rawChange, {
      scheme,
      allowedSources: allowedSet,
      proposedFields,
      officialPageText,
    })
    if (!result.ok) {
      outcome.rejected.push(result.rejected)
      continue
    }
    if (seenFields.has(result.change.field)) {
      outcome.rejected.push({
        schemeId: scheme.id,
        field: result.change.field,
        proposedValue: result.change.newValue,
        sourceUrl: result.change.sourceUrl,
        reason: "Duplicate change for the same field in one response.",
      })
      continue
    }
    seenFields.add(result.change.field)
    outcome.applied.push(result.change)
  }

  // The money pair is enforced in both directions: if one half was accepted and
  // the other was rejected, roll the survivor back rather than ship a mismatch.
  const hasAmount = outcome.applied.some((c) => c.field === "benefitAmount")
  const hasLabel = outcome.applied.some((c) => c.field === "benefitAmountLabel")
  if (hasAmount !== hasLabel) {
    const orphanField: RefreshableField = hasAmount ? "benefitAmount" : "benefitAmountLabel"
    const orphan = outcome.applied.find((c) => c.field === orphanField)
    outcome.applied = outcome.applied.filter((c) => c.field !== orphanField)
    if (orphan) {
      outcome.rejected.push({
        schemeId: scheme.id,
        field: orphanField,
        proposedValue: orphan.newValue,
        sourceUrl: orphan.sourceUrl,
        reason: "Its paired field failed validation, so the amount and its description would have disagreed.",
      })
    }
  }

  return outcome
}

/* ------------------------------------------------------------------ merging */

/** Applies an outcome's accepted changes on top of the curated baseline. */
export function applyOutcome(baseline: Scheme, outcome: SchemeRefreshOutcome): Scheme {
  const merged: Scheme = { ...baseline }

  for (const change of outcome.applied) {
    ;(merged as any)[change.field] = change.newValue
  }

  if (outcome.lastVerified) merged.lastVerified = outcome.lastVerified

  if (outcome.applied.length) {
    const citations = outcome.applied.map((change) => change.sourceUrl)
    merged.sources = Array.from(new Set([...citations, ...baseline.sources])).slice(0, 10)
  }

  return merged
}

/* -------------------------------------------------------------- persistence */

/** Maps our category onto the legacy model's enum, which predates this dataset. */
const LEGACY_CATEGORY: Record<Scheme["category"], string> = {
  credit: "loans_credit",
  subsidy: "subsidies",
  insurance: "crop_insurance",
  mechanisation: "technology_adoption",
  energy: "infrastructure",
  land: "infrastructure",
  "financial-assistance": "financial_assistance",
}

/**
 * Upserts the merged scheme into MongoDB.
 *
 * The canonical record lives in `curated` as the exact shape the API serves —
 * the legacy top-level fields are populated alongside it only to satisfy the
 * existing schema's `required` validators and keep the document queryable by
 * older code.
 */
async function persistScheme(scheme: Scheme, outcome: SchemeRefreshOutcome): Promise<void> {
  await GovernmentScheme.findOneAndUpdate(
    { schemeKey: scheme.id },
    {
      $set: {
        schemeKey: scheme.id,
        curated: scheme,
        refreshMeta: {
          lastRunAt: new Date(),
          model: REFRESH_MODEL,
          grounded: outcome.grounded,
          changesApplied: outcome.applied.length,
          changesRejected: outcome.rejected.length,
          sourcesSeen: outcome.sourcesSeen,
        },
        // Legacy fields, kept in sync so the document validates and remains
        // readable by anything still using the old shape.
        name: { en: scheme.name, ur: scheme.nameUr },
        description: { en: scheme.description, ur: scheme.descriptionUr },
        category: LEGACY_CATEGORY[scheme.category],
        level: scheme.province === "Federal" ? "central" : "state",
        coverage: scheme.province === "Federal" ? "national" : "state_specific",
        applicableStates: scheme.provincesCovered,
        status: scheme.status,
        isCurrentlyAcceptingApplications: scheme.status === "active",
        sourceUrl: scheme.officialUrl,
        dataSource: "api",
        lastUpdated: new Date(),
        lastVerified: scheme.lastVerified ? new Date(`${scheme.lastVerified}T00:00:00Z`) : new Date(),
        tags: scheme.tags,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

/**
 * When each scheme was last re-checked, as epoch millis. Never-checked schemes
 * are simply absent, so they sort first.
 *
 * A database failure here is not fatal — we lose the rotation for one run and
 * fall back to the curated order rather than refusing to refresh at all.
 */
async function loadLastRunTimes(): Promise<Map<string, number>> {
  const times = new Map<string, number>()
  if (!process.env.MONGODB_URI) return times

  try {
    await connectDB()
    const documents: any[] = await GovernmentScheme.find({ schemeKey: { $exists: true, $ne: null } })
      .select({ schemeKey: 1, "refreshMeta.lastRunAt": 1 })
      .lean()
      .exec()

    for (const document of documents) {
      const runAt = document?.refreshMeta?.lastRunAt
      if (document?.schemeKey && runAt) times.set(document.schemeKey, new Date(runAt).getTime())
    }
  } catch {
    /* rotation is a nicety; carry on without it */
  }
  return times
}

/* ---------------------------------------------------------------- the driver */

export interface RefreshOptions {
  /** Restrict the run to these scheme ids. Defaults to every scheme. */
  schemeIds?: string[]
  /** Verify and report, but write nothing. */
  dryRun?: boolean
  concurrency?: number
  /** Wall-clock budget; the run returns a partial report rather than be killed. */
  budgetMs?: number
}

/**
 * Re-verifies the curated schemes against the live web and stores the result.
 *
 * A single 60s serverless invocation only gets through three or four schemes,
 * so a run is deliberately partial: schemes are processed longest-unchecked
 * first and whatever does not fit is reported in `skippedForTime`. Successive
 * cron runs rotate through the rest, covering the full list every few days.
 */
export async function refreshSchemes(options: RefreshOptions = {}): Promise<RefreshReport> {
  const startedAt = new Date()
  // 50s inside a 60s maxDuration: enough headroom to persist and serialise the
  // report, without wasting a third of the window.
  const budgetMs = Math.min(Math.max(options.budgetMs ?? 50_000, 5_000), 120_000)
  const deadline = Date.now() + budgetMs
  const dryRun = Boolean(options.dryRun)
  const concurrency = Math.min(Math.max(options.concurrency ?? 4, 1), 6)

  if (!isRefreshConfigured()) throw new RefreshNotConfiguredError()

  let targets = [...PAKISTAN_SCHEMES]
  if (options.schemeIds?.length) {
    const wanted = new Set(options.schemeIds.map((id) => id.trim().toLowerCase()))
    targets = targets.filter((scheme) => wanted.has(scheme.id))
    if (targets.length === 0) {
      // A typo in `schemeIds` must not read as "the model failed to verify
      // anything" — that would send a caller hunting the wrong problem.
      throw new UnknownSchemeError(options.schemeIds)
    }
  }
  // Stalest first, by when we last actually re-checked each scheme.
  //
  // This must come from the database, not from `lastVerified` in the curated
  // file: those values are all written by hand on the same day, so ordering by
  // them is a no-op and every run would re-check the same first few schemes
  // while the rest were never looked at again. Ordering by the stored run time
  // makes successive crons rotate through the whole list.
  const lastRunByScheme = await loadLastRunTimes()
  targets.sort((a, b) => (lastRunByScheme.get(a.id) ?? 0) - (lastRunByScheme.get(b.id) ?? 0))

  const skippedForTime: string[] = []
  const outcomes: SchemeRefreshOutcome[] = []

  await pool(targets, concurrency, async (scheme) => {
    if (Date.now() > deadline - PER_SCHEME_RESERVE_MS) {
      skippedForTime.push(scheme.id)
      return
    }
    try {
      outcomes.push(await refreshOneScheme(scheme, deadline))
    } catch (error: any) {
      outcomes.push({
        schemeId: scheme.id,
        name: scheme.name,
        grounded: false,
        officialPageRead: false,
        searchQueries: [],
        sourcesSeen: [],
        applied: [],
        rejected: [],
        uncited: [],
        lastVerified: null,
        error: redact(error?.message ?? String(error)),
      })
    }
  })

  /* Persist. A storage failure must not lose the report or break serving. */
  let persisted = 0
  let persistError: string | null = null

  const worthStoring = outcomes.filter((outcome) => outcome.grounded && outcome.lastVerified)

  if (!dryRun && worthStoring.length) {
    try {
      await connectDB()
      for (const outcome of worthStoring) {
        const baseline = PAKISTAN_SCHEMES.find((scheme) => scheme.id === outcome.schemeId)
        if (!baseline) continue
        await persistScheme(applyOutcome(baseline, outcome), outcome)
        persisted += 1
      }
    } catch (error: any) {
      persistError = redact(error?.message ?? String(error))
    }
  }

  const finishedAt = new Date()

  return {
    ok: true,
    model: REFRESH_MODEL,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    dryRun,
    checked: outcomes.filter((outcome) => outcome.grounded).length,
    skippedForTime,
    changesApplied: outcomes.reduce((sum, outcome) => sum + outcome.applied.length, 0),
    changesRejected: outcomes.reduce((sum, outcome) => sum + outcome.rejected.length, 0),
    persisted,
    persistError,
    schemes: outcomes,
  }
}

/* ------------------------------------------------------------------ serving */

export interface LoadedSchemes {
  schemes: Scheme[]
  /** Where the served list came from, for the API `meta` block. */
  source: "database" | "curated" | "mixed"
  /** Most recent successful refresh across the served schemes, if any. */
  refreshedAt: string | null
  /** Non-fatal reason the database copy was not used. */
  notice: string | null
}

/** Cheap structural check before we trust a stored blob as a Scheme. */
function looksLikeScheme(value: any): value is Scheme {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.province === "string" &&
    typeof value.category === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.benefits) &&
    Array.isArray(value.eligibility) &&
    Boolean(value.eligibilityRules)
  )
}

/**
 * Returns the schemes to serve: the refreshed MongoDB copy where one exists,
 * the curated baseline everywhere else.
 *
 * This function does not throw. Every failure — no MONGODB_URI, Atlas
 * unreachable, an empty or corrupt collection — degrades to the curated file,
 * because an out-of-date scheme list is recoverable and an empty schemes page
 * is not.
 */
export async function loadSchemes(): Promise<LoadedSchemes> {
  const fallback: LoadedSchemes = {
    schemes: PAKISTAN_SCHEMES,
    source: "curated",
    refreshedAt: null,
    notice: null,
  }

  if (!process.env.MONGODB_URI) {
    return { ...fallback, notice: "No database configured; serving the curated baseline." }
  }

  try {
    await connectDB()
    const documents: any[] = await GovernmentScheme.find({ schemeKey: { $exists: true, $ne: null } })
      .select({ schemeKey: 1, curated: 1, refreshMeta: 1 })
      .lean()
      .exec()

    const stored = new Map<string, Scheme>()
    let refreshedAt: string | null = null

    for (const document of documents) {
      if (!looksLikeScheme(document?.curated)) continue
      stored.set(document.curated.id, document.curated as Scheme)
      const runAt = document?.refreshMeta?.lastRunAt
      if (runAt) {
        const iso = new Date(runAt).toISOString()
        if (!refreshedAt || iso > refreshedAt) refreshedAt = iso
      }
    }

    if (stored.size === 0) {
      return { ...fallback, notice: "No refreshed data stored yet; serving the curated baseline." }
    }

    // Curated order is deliberate; keep it and overlay what the DB has.
    const schemes = PAKISTAN_SCHEMES.map((scheme) => stored.get(scheme.id) ?? scheme)

    // Anything stored that the baseline no longer lists is appended, so a
    // future scheme added by a refresh is not silently dropped.
    const baselineIds = new Set(PAKISTAN_SCHEMES.map((scheme) => scheme.id))
    for (const [id, scheme] of stored) {
      if (!baselineIds.has(id)) schemes.push(scheme)
    }

    return {
      schemes,
      source: stored.size >= PAKISTAN_SCHEMES.length ? "database" : "mixed",
      refreshedAt,
      notice: null,
    }
  } catch (error: any) {
    return {
      ...fallback,
      notice: `Database unavailable (${redact(error?.message ?? String(error)).slice(0, 120)}); serving the curated baseline.`,
    }
  }
}
