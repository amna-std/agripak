"use client"

/**
 * Desktop sidebar (>= md). The mobile equivalent is `BottomNavigation`.
 *
 * Deliberately a plain `<aside>` rather than the shadcn `Sidebar` primitive: that
 * one needs a `SidebarProvider` and hardcodes left/right offsets, which breaks
 * under `dir="rtl"`. Everything here uses logical properties, so the panel moves
 * to the right-hand edge automatically for Urdu, Punjabi, Sindhi and Pashto.
 *
 * Takes no required props — it reads the route, the user and the language from
 * context, so any page can drop it in.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogIn, LogOut, Sprout } from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { NAV_ITEMS, isActiveHref } from "@/components/nav-items"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { cn } from "@/lib/utils"

export interface EnhancedSidebarProps {
  className?: string
}

export function EnhancedSidebar({ className }: EnhancedSidebarProps) {
  const pathname = usePathname()
  const { t, isRTL } = useLanguage()
  const { user, logout } = useAuth()

  return (
    <aside
      aria-label={t("nav.menu")}
      className={cn(
        "sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
        className,
      )}
    >
      <Link
        href={user ? "/dashboard" : "/"}
        className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sprout className="h-6 w-6" aria-hidden />
        </span>
        {/* `leading-[1.7]`, not `leading-tight`: Nastaliq descenders are clipped by
            the tight leading Latin text is happy with. */}
        <span className="min-w-0">
          <span className="block truncate text-lg font-bold leading-[1.7]">{t("common.appName")}</span>
          <span className="block truncate text-xs leading-[1.7] text-muted-foreground">{t("common.tagline")}</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActiveHref(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-tap items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="truncate leading-[1.9]">{t(item.labelKey)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-3">
        <LanguageSwitcher variant="compact" showLabel className="w-full justify-start" />

        {user ? (
          <>
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {(user.name?.trim()?.charAt(0) || "?").toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-[1.8]">{user.name}</span>
                {user.district ? (
                  <span className="block truncate text-xs leading-[1.8] text-muted-foreground">{user.district}</span>
                ) : null}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex min-h-tap w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className={cn("h-5 w-5 shrink-0", isRTL && "-scale-x-100")} aria-hidden />
              <span className="leading-[1.9]">{t("auth.logout")}</span>
            </button>
          </>
        ) : (
          <Link
            href="/auth/login"
            className="flex min-h-tap w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-accent"
          >
            <LogIn className={cn("h-5 w-5 shrink-0", isRTL && "-scale-x-100")} aria-hidden />
            <span className="leading-[1.9]">{t("auth.login")}</span>
          </Link>
        )}
      </div>
    </aside>
  )
}

export default EnhancedSidebar
