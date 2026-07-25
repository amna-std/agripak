import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { Inter } from "next/font/google"

import "./globals.css"
import { Providers } from "@/components/providers/Providers"
import { AppShell } from "@/components/AppShell"

/**
 * Latin face. `variable` mode (rather than `className`) is deliberate: it exposes
 * `--font-inter`, which `app/globals.css` folds into `--font-latin`. That lets the
 * `html[lang="ur"] body` rules swap in Noto Nastaliq Urdu without fighting a
 * next/font class on <body>.
 *
 * The Arabic-script faces (Noto Nastaliq Urdu for ur/pa, Noto Naskh Arabic for
 * sd/ps) are loaded by the `@import` at the top of globals.css — four of the five
 * locales need them, and next/font would inline them for the English majority too.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: {
    default: "AgriPak — AI farming advisor for Pakistan",
    template: "%s | AgriPak",
  },
  description:
    "AgriPak gives Pakistani farmers district-level weather, live mandi rates in PKR, AI crop and disease advice, government schemes and a farmer marketplace — in Urdu, Punjabi, Sindhi, Pashto and English.",
  applicationName: "AgriPak",
  keywords: [
    "Pakistan farming",
    "kisan",
    "mandi rates",
    "AMIS prices",
    "wheat",
    "cotton",
    "rice",
    "sugarcane",
    "Rabi",
    "Kharif",
    "Kissan Card",
    "crop disease detection",
    "Urdu farming app",
  ],
  authors: [{ name: "AgriPak" }],
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "AgriPak",
    locale: "ur_PK",
    title: "AgriPak — AI farming advisor for Pakistan",
    description:
      "Weather, mandi prices, crop advice and government schemes for farmers across Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, AJK and Gilgit-Baltistan.",
  },
}

/**
 * Next 14 wants viewport and themeColor here, not in `metadata` — keeping them in
 * the metadata export logs a build warning on every page.
 *
 * `maximumScale` is intentionally unset: pinch-zoom must keep working for farmers
 * reading small print outdoors. `viewportFit: "cover"` lets the `safe-b` / `safe-t`
 * utilities reach under notches and home indicators.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#01411C" },
    { media: "(prefers-color-scheme: dark)", color: "#01411C" },
  ],
}

/**
 * Applies the saved language to <html> before first paint.
 *
 * `LanguageProvider` does the same thing in an effect, but that runs after
 * hydration — an Urdu user would see one frame of left-to-right English layout.
 * Keep the storage key and the RTL list in sync with lib/data/translations/index.ts.
 */
const LANGUAGE_BOOTSTRAP = `
(function(){try{
  var codes=["en","ur","pa","sd","ps"];
  var stored=window.localStorage.getItem("agripak.language");
  var lang=codes.indexOf(stored)>-1?stored:"en";
  var root=document.documentElement;
  root.lang=lang;
  root.dir=lang==="en"?"ltr":"rtl";
}catch(e){}})();
`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `lang`/`dir` are the SSR defaults; the script above and LanguageProvider
    // correct them on the client, hence suppressHydrationWarning (next-themes
    // needs it on this element too).
    <html lang="en" dir="ltr" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* The Arabic-script webfonts come from Google; warm the connection early
            — rural 3G makes the extra round-trip very visible. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: LANGUAGE_BOOTSTRAP }} />
      </head>
      <body>
        {/* AppShell owns the header, sidebar, bottom bar and the skip link — it is
            a client component, so its labels can go through t(). */}
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
