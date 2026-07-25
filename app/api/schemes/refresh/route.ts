import { fail, handler, ok, readJson, searchParams } from "@/lib/api-helpers"
import { authenticate, hasRole } from "@/lib/auth-helpers"
import {
  RefreshNotConfiguredError,
  UnknownSchemeError,
  isRefreshConfigured,
  refreshSchemes,
  type RefreshReport,
} from "@/lib/services/schemesRefresh"

export const dynamic = "force-dynamic"
/** Nine schemes, each needing a grounded web search, will not fit in 10s. */
export const maxDuration = 60

/**
 * POST /api/schemes/refresh — re-verify the government scheme data.
 *
 * Runs the curated baseline in `lib/data/pakistan-schemes.ts` past Gemini with
 * Google Search grounding, keeps only the changes the model can cite to a real
 * page on a trusted domain, and stores the corrected records in MongoDB. See
 * `lib/services/schemesRefresh.ts` for why the citation gate is built the way
 * it is.
 *
 * Vercel Cron issues a GET, so both verbs are exported. Wired up weekly in
 * `vercel.json`.
 *
 * Access — any one of:
 *   - the `x-vercel-cron` header (Vercel strips this from external requests)
 *   - `Authorization: Bearer $CRON_SECRET`
 *   - a signed-in user with the `admin` role
 *
 * Body / query (all optional):
 *   schemeIds   comma-separated list, or a JSON array — defaults to all
 *   dryRun      true to verify and report without writing to MongoDB
 *   concurrency 1–6, default 4
 *   budgetMs    wall-clock budget, default 45000
 *
 * This endpoint never mutates the curated file and never deletes a scheme. The
 * worst case for a farmer is that the data stays exactly as it was.
 */

interface RefreshInput {
  schemeIds?: unknown
  dryRun?: unknown
  concurrency?: unknown
  budgetMs?: unknown
}

async function authorize(req: Request): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (req.headers.get("x-vercel-cron")) return { ok: true }

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return { ok: true }
  }

  const auth = await authenticate(req)
  if (auth.ok && hasRole(auth, "admin")) return { ok: true }
  if (auth.ok) return { ok: false, status: 403, message: "Admin role required to refresh scheme data." }

  return { ok: false, status: 401, message: "Not authorised to refresh scheme data." }
}

function parseIds(input: unknown): string[] | undefined {
  if (input == null || input === "") return undefined
  const tokens = Array.isArray(input)
    ? input.map((token) => String(token).trim())
    : String(input)
        .split(",")
        .map((token) => token.trim())
  const ids = tokens.filter(Boolean)
  return ids.length ? ids : undefined
}

function parseBool(input: unknown): boolean {
  return input === true || input === "true" || input === "1"
}

function parseNumber(input: unknown): number | undefined {
  if (input == null || input === "") return undefined
  const value = Number(input)
  return Number.isFinite(value) ? value : undefined
}

/** Trims the full report down to something readable in a cron log. */
function summarise(report: RefreshReport) {
  return {
    model: report.model,
    dryRun: report.dryRun,
    durationMs: report.durationMs,
    schemesChecked: report.checked,
    changesApplied: report.changesApplied,
    changesRejected: report.changesRejected,
    schemesPersisted: report.persisted,
    skippedForTime: report.skippedForTime,
    persistError: report.persistError,
    // Every accepted change, with the citation that let it through.
    applied: report.schemes.flatMap((scheme) =>
      scheme.applied.map((change) => ({
        scheme: scheme.schemeId,
        field: change.field,
        from: change.oldValue,
        to: change.newValue,
        source: change.sourceUrl,
        sourceDate: change.sourceDate,
        sourceTier: change.sourceTier,
        quote: change.quote,
      })),
    ),
    // Everything the model wanted to do and was not allowed to. Worth reading:
    // this is where fabricated citations and junk figures show up.
    rejected: report.schemes.flatMap((scheme) =>
      scheme.rejected.map((change) => ({
        scheme: scheme.schemeId,
        field: change.field,
        proposed: change.proposedValue,
        source: change.sourceUrl,
        reason: change.reason,
      })),
    ),
    perScheme: report.schemes.map((scheme) => ({
      id: scheme.schemeId,
      grounded: scheme.grounded,
      officialPageRead: scheme.officialPageRead,
      searchQueries: scheme.searchQueries,
      sourcesSeen: scheme.sourcesSeen,
      applied: scheme.applied.length,
      rejected: scheme.rejected.length,
      uncited: scheme.uncited,
      lastVerified: scheme.lastVerified,
      error: scheme.error,
    })),
  }
}

async function run(req: Request, input: RefreshInput) {
  const gate = await authorize(req)
  if (!gate.ok) return fail(gate.message, gate.status)

  if (!isRefreshConfigured()) {
    // No key is a deployment gap, not a farmer-facing outage — the schemes API
    // carries on serving the curated baseline either way.
    return fail(
      "GEMINI_API_KEY is not configured, so scheme data cannot be re-verified. The curated baseline is still being served.",
      503,
      { code: "not_configured" },
    )
  }

  const concurrency = parseNumber(input.concurrency)
  if (concurrency !== undefined && (concurrency < 1 || concurrency > 6)) {
    return fail("`concurrency` must be between 1 and 6.")
  }

  let report: RefreshReport
  try {
    report = await refreshSchemes({
      schemeIds: parseIds(input.schemeIds),
      dryRun: parseBool(input.dryRun),
      concurrency,
      budgetMs: parseNumber(input.budgetMs),
    })
  } catch (error: any) {
    if (error instanceof RefreshNotConfiguredError) {
      return fail(error.message, 503, { code: "not_configured" })
    }
    if (error instanceof UnknownSchemeError) {
      return fail(error.message, 400, { code: "unknown_scheme" })
    }
    // Upstream down, network unreachable, key rejected: report it, change
    // nothing, keep serving.
    return fail(
      `Scheme refresh could not run: ${error?.message ?? String(error)}. Existing scheme data is unchanged and still being served.`,
      502,
      { code: "refresh_failed" },
    )
  }

  const summary = summarise(report)

  if (report.checked === 0) {
    return fail(
      "No scheme could be verified — the model returned no grounded search results, so nothing was changed.",
      502,
      { code: "no_grounding", data: summary },
    )
  }

  const message = report.dryRun
    ? `Dry run: checked ${report.checked} scheme(s), ${report.changesApplied} cited change(s) would be applied, ${report.changesRejected} rejected. Nothing was written.`
    : `Checked ${report.checked} scheme(s) against live sources: ${report.changesApplied} cited change(s) applied, ${report.changesRejected} rejected, ${report.persisted} record(s) stored.`

  return ok({ message, data: summary })
}

export const POST = handler(async (req: Request) => run(req, await readJson(req)))

/** Vercel Cron calls GET; query params mirror the JSON body. */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  return run(req, {
    schemeIds: params.get("schemeIds"),
    dryRun: params.get("dryRun"),
    concurrency: params.get("concurrency"),
    budgetMs: params.get("budgetMs"),
  })
})
