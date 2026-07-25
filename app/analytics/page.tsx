// DISABLED (out of scope for v1) — see the note below
//
// There is no analytics endpoint and no verified farm-record data to drive one:
// `GET /api/user/dashboard` only exposes what the farmer typed into their own
// profile (crop history, login counts), which is far too thin to chart honestly.
// Rule 5 of the contract bans invented figures, so rather than draw yield curves
// out of nothing this route is kept on disk, removed from navigation
// (components/nav-items.ts) and renders a plain, translated "not enabled" notice
// for anyone who reaches it by URL.
//
// To re-enable: build a real aggregation route (e.g. GET /api/user/analytics over
// User.cropHistory + MarketPrice) and replace the notice below with charts fed by it.
//
// ---------------------------------------------------------------------------
// Original placeholder implementation, preserved verbatim:
//
// const translations = {
//   en: { title: "Farm Analytics", overview: "Overview", backToDashboard: "Back to Dashboard" },
//   hi: { title: "कृषि विश्लेषण", overview: "अवलोकन", backToDashboard: "डैशबोर्ड पर लौटें" },
// } as const
//
// export default function AnalyticsPage() {
//   const router = useRouter()
//   return (
//     <div className="container mx-auto p-6">
//       <div className="flex items-center justify-between mb-4">
//         <h1 className="text-2xl font-bold">{translations.en.title}</h1>
//         <Button variant="outline" onClick={() => router.push("/dashboard")}>
//           {translations.en.backToDashboard}
//         </Button>
//       </div>
//       <Card>
//         <CardHeader><CardTitle>{translations.en.overview}</CardTitle></CardHeader>
//         <CardContent><p>Analytics page content coming soon.</p></CardContent>
//         <CardFooter />
//       </Card>
//     </div>
//   )
// }
// ---------------------------------------------------------------------------

"use client"

import Link from "next/link"
import { BarChart3 } from "lucide-react"

import { useLanguage } from "@/lib/contexts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AnalyticsPage() {
  const { t } = useLanguage()

  return (
    <div className="container-app py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base leading-[1.8]">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
            {t("dashboard.analyticsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-[1.9] text-muted-foreground">{t("dashboard.analyticsDisabled")}</p>
          <Button asChild className="min-h-[44px] w-full sm:w-auto">
            <Link href="/dashboard">{t("dashboard.backToDashboard")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
