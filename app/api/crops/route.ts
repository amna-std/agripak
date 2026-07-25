import { ok, handler, searchParams } from "@/lib/api-helpers"
import { ADVISORY_NOTE, PAKISTAN_AGRO_ZONES, PAKISTAN_CROPS, currentSeason } from "./_data/pakistan-crops"
import { applyFilters, filterOptions, paginate, readFilters, toSummary } from "./_lib/select"

export const dynamic = "force-dynamic"

/**
 * GET /api/crops — the Pakistani crop catalogue.
 *
 * Public. Filter with ?season=rabi|kharif|perennial, ?category=, ?province=,
 * ?zone=, ?soil=, ?search=, and page with ?page= & ?limit=.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const filters = readFilters(params)

  const filtered = applyFilters(PAKISTAN_CROPS, filters)
  const { slice, pagination } = paginate(filtered, params)

  return ok({
    data: {
      crops: slice.map(toSummary),
      pagination,
      appliedFilters: filters,
      filters: filterOptions(),
      zones: PAKISTAN_AGRO_ZONES,
      season: {
        current: currentSeason(),
        rabi: "November – April",
        kharif: "May – October",
      },
      advisory: ADVISORY_NOTE,
    },
  })
})
