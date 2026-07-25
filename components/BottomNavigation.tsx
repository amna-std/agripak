"use client"

/**
 * Mobile bottom navigation (hidden from `md` up, where the sidebar takes over).
 *
 * Four pinned sections plus a "More" sheet holding the rest — five 44px targets
 * is the most that stays comfortably tappable on a 360px screen.
 *
 * Direction-safe by construction: it is a flex row of equal columns, so it
 * mirrors itself under `dir="rtl"` without any per-side CSS.
 */

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogIn, LogOut, MoreHorizontal } from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { PRIMARY_MOBILE_ITEMS, SECONDARY_MOBILE_ITEMS, isActiveHref, isChromelessRoute, type NavItem } from "@/components/nav-items"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

function TabLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const { t } = useLanguage()
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-tap flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("h-6 w-6 shrink-0", active && "stroke-[2.5]")} aria-hidden />
      <span className="w-full truncate text-center text-[0.6875rem] font-semibold leading-[1.7]">
        {t(item.shortLabelKey ?? item.labelKey)}
      </span>
    </Link>
  )
}

export function BottomNavigation() {
  const pathname = usePathname()
  const { t, isRTL } = useLanguage()
  const { user, logout } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)

  if (isChromelessRoute(pathname)) return null

  const moreActive = SECONDARY_MOBILE_ITEMS.some((item) => isActiveHref(pathname, item.href))

  return (
    <nav
      aria-label={t("nav.menu")}
      className="safe-b fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-3xl items-stretch gap-0.5 px-1 py-1">
        {PRIMARY_MOBILE_ITEMS.map((item) => (
          <TabLink key={item.href} item={item} active={isActiveHref(pathname, item.href)} />
        ))}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label={t("nav.openMenu")}
              className={cn(
                "flex min-h-tap flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MoreHorizontal className="h-6 w-6 shrink-0" aria-hidden />
              <span className="w-full truncate text-center text-[0.6875rem] font-semibold leading-[1.7]">
                {t("nav.more")}
              </span>
            </button>
          </SheetTrigger>

          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-8 pt-5">
            <SheetHeader className="text-start">
              <SheetTitle>{t("nav.menu")}</SheetTitle>
            </SheetHeader>

            <ul className="mt-4 grid grid-cols-2 gap-2">
              {SECONDARY_MOBILE_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isActiveHref(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-tap items-center gap-3 rounded-xl border px-3 py-3 text-start text-sm font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="truncate leading-[1.9]">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>

            <div className="mt-6 border-t border-border pt-4">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">{t("nav.chooseLanguage")}</p>
              <LanguageSwitcher variant="list" onSelected={() => setMoreOpen(false)} />
            </div>

            <div className="mt-6">
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    logout()
                  }}
                  className="flex min-h-tap w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className={cn("h-5 w-5", isRTL && "-scale-x-100")} aria-hidden />
                  {t("auth.logout")}
                </button>
              ) : (
                <Link
                  href="/auth/login"
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-tap w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  <LogIn className={cn("h-5 w-5", isRTL && "-scale-x-100")} aria-hidden />
                  {t("auth.login")}
                </Link>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}

export default BottomNavigation
