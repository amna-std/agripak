"use client"

/**
 * The application chrome: desktop sidebar, sticky header, mobile bottom bar and
 * the floating AI assistant.
 *
 * The header carries the marketplace cart (with a live item count), because the
 * cart has to be reachable from wherever the farmer happens to be — otherwise
 * "added to cart" is a message with nowhere to go.
 *
 * Mounted once in `app/layout.tsx` and wrapped around every page, so individual
 * pages render their content only — they must not re-declare navigation.
 *
 * The landing page and the auth screens are "chromeless" (see
 * `components/nav-items.ts`): they get the raw `children` with no shell.
 *
 * Everything is laid out with flex + logical properties, so the sidebar sits on
 * the right and the header mirrors automatically when `dir="rtl"`.
 */

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sprout } from "lucide-react"

import { useLanguage } from "@/lib/contexts"
import { isChromelessRoute } from "@/components/nav-items"
import { EnhancedSidebar } from "@/components/enhanced-sidebar"
import { BottomNavigation } from "@/components/BottomNavigation"
import { NotificationSystem } from "@/components/NotificationSystem"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeToggle } from "@/components/theme-provider"
import { AIChatbot } from "@/components/ai-chatbot"
import { CartButton } from "@/app/marketplace/_cart-button"

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { t } = useLanguage()

  if (isChromelessRoute(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        // start-0/top-0 pins the visually-hidden link to the corner. Without it
        // the 1px sr-only box sits at its static position, which in RTL is the
        // far edge — enough to create a 1px horizontal scroll on mobile.
        className="sr-only start-0 top-0 focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        {t("common.skipToContent")}
      </a>

      <EnhancedSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-t sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            {/* Brand doubles as "home" on mobile, where there is no sidebar. */}
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2 md:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sprout className="h-5 w-5" aria-hidden />
              </span>
              <span className="truncate text-base font-bold leading-[1.7]">{t("common.appName")}</span>
            </Link>

            <div className="flex-1" />

            {/* Always present: the marketplace cart is a dead end without it. */}
            <CartButton />
            <NotificationSystem />
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <main id="main-content" className="pb-nav flex-1 md:pb-8">
          {children}
        </main>
      </div>

      <BottomNavigation />
      <AIChatbot />
    </div>
  )
}

export default AppShell
