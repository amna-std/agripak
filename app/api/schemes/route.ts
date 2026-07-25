import { ok, handler, searchParams } from "@/lib/api-helpers"
import {
  COVERAGE_NOTE,
  SCHEME_CATEGORIES,
  SCHEME_PROVINCES,
  type SchemeCategory,
  type SchemeStatus,
} from "@/lib/data/pakistan-schemes"
import { loadSchemes } from "@/lib/services/schemesRefresh"
import { filterSchemes, optionalUser, resolveProvince, toSummary } from "./_lib/match"

export const dynamic = "force-dynamic"

/**
 * GET /api/schemes — real Pakistani government schemes for farmers.
 *
 * Public. Filter with ?province= (short label "KPK" or full "Khyber
 * Pakhtunkhwa"; federal schemes are always included), ?category=, ?status=,
 * ?search= and ?featured=true. Paginate with ?page= & ?limit=.
 *
 * Passing no province while signed in falls back to the farmer's own province.
 *
 * Data comes from the refreshed MongoDB copy where one exists and the curated
 * file otherwise — see `loadSchemes`, which degrades to the file on any
 * database problem rather than serving a farmer an empty list. The `meta`
 * block says which source answered.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const { schemes, source, refreshedAt, notice } = await loadSchemes()

  const requestedProvince = params.get("province") ?? params.get("state")
  const user = requestedProvince ? null : await optionalUser(req)
  const provinceInput = requestedProvince ?? user?.state ?? null
  const { label, canonical } = resolveProvince(provinceInput)

  const category = params.get("category")?.trim().toLowerCase()
  const status = params.get("status")?.trim().toLowerCase()

  const filtered = filterSchemes(
    {
      province: provinceInput,
      category: category && category !== "all" ? (category as SchemeCategory) : null,
      status: status ? (status as SchemeStatus | "all") : null,
      search: params.get("search")?.trim() || params.get("q")?.trim() || null,
      featured: params.get("featured") === "true",
    },
    schemes,
  )

  const page = Math.max(1, Math.trunc(Number(params.get("page")) || 1))
  const limit = Math.min(Math.max(Math.trunc(Number(params.get("limit")) || 20), 1), 50)
  const slice = filtered.slice((page - 1) * limit, (page - 1) * limit + limit)

  return ok({
    data: {
      schemes: slice.map(toSummary),
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      },
      appliedFilters: {
        province: canonical ?? label ?? "all",
        category: category ?? "all",
        status: status ?? "all",
        search: params.get("search") ?? null,
      },
      filters: {
        provinces: SCHEME_PROVINCES,
        categories: SCHEME_CATEGORIES.filter((c) => schemes.some((s) => s.category === c.id)),
        statuses: [
          { id: "active", name: "Open now" },
          { id: "closed", name: "Applications closed" },
          { id: "upcoming", name: "Announced" },
        ],
      },
      counts: {
        total: schemes.length,
        active: schemes.filter((s) => s.status === "active").length,
        matchingFilters: filtered.length,
      },
      currency: "PKR",
      coverageNote: COVERAGE_NOTE,
      // Additive; the UI ignores what it does not read.
      meta: {
        source,
        lastRefreshedAt: refreshedAt,
        notice,
        lastVerified: schemes.reduce<string | null>(
          (latest, scheme) => (!latest || scheme.lastVerified > latest ? scheme.lastVerified : latest),
          null,
        ),
      },
    },
  })
})
