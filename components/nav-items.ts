/**
 * The single source of truth for AgriPak navigation.
 *
 * Both the mobile bottom bar (`components/BottomNavigation.tsx`) and the desktop
 * sidebar (`components/enhanced-sidebar.tsx`) read this list, so a section is
 * added or removed in exactly one place.
 *
 * `labelKey` is a translation key — never a literal string. Render it with
 * `t(item.labelKey)` so all five languages work.
 *
 * Deferred features (videos, farming ideas, WhatsApp groups, the duplicate
 * "doctor" page, ratings, analytics) are deliberately absent: their files still
 * exist on disk deliberately kept but disabled, but nothing links to them.
 */

import {
  Bot,
  CloudSun,
  Landmark,
  LayoutDashboard,
  ScanLine,
  ShoppingCart,
  Sprout,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react"
import type { TranslationKey } from "@/lib/i18n"

export interface NavItem {
  /** App route. Must be a page that actually exists under `app/`. */
  href: string
  /** Dot-path translation key, e.g. `"nav.weather"`. */
  labelKey: TranslationKey
  /**
   * Shorter label for the ~70px mobile tab. Only set where the full label would
   * be truncated — "بیماری کی جانچ" does not fit five-across at 360px.
   */
  shortLabelKey?: TranslationKey
  icon: LucideIcon
  /** True when the page redirects anonymous visitors to /auth/login. */
  requiresAuth?: boolean
}

/** Every section a farmer can reach. Order = sidebar order. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, requiresAuth: true },
  { href: "/weather", labelKey: "nav.weather", icon: CloudSun },
  { href: "/market", labelKey: "nav.market", icon: TrendingUp },
  { href: "/crop-advisor", labelKey: "nav.crops", icon: Sprout },
  { href: "/crop-scan", labelKey: "nav.diseaseScan", shortLabelKey: "nav.scan", icon: ScanLine },
  { href: "/schemes", labelKey: "nav.schemes", icon: Landmark },
  { href: "/marketplace", labelKey: "nav.marketplace", icon: ShoppingCart },
  { href: "/community", labelKey: "nav.community", icon: Users },
  { href: "/ai-assistant", labelKey: "nav.aiAssistant", icon: Bot },
  { href: "/profile", labelKey: "nav.profile", icon: User, requiresAuth: true },
]

/**
 * The four routes that get a permanent slot in the mobile bar. The fifth slot is
 * a "More" sheet holding everything else — five items is the most that stays
 * tappable (44px) at 360px.
 */
export const PRIMARY_MOBILE_HREFS = ["/dashboard", "/weather", "/market", "/crop-scan"] as const

export const PRIMARY_MOBILE_ITEMS: NavItem[] = PRIMARY_MOBILE_HREFS.map(
  (href) => NAV_ITEMS.find((item) => item.href === href)!,
)

/** Everything not pinned to the mobile bar — shown inside the "More" sheet. */
export const SECONDARY_MOBILE_ITEMS: NavItem[] = NAV_ITEMS.filter(
  (item) => !(PRIMARY_MOBILE_HREFS as readonly string[]).includes(item.href),
)

/**
 * Routes that render their own full-bleed layout (landing page, auth screens).
 * The app shell hides its header, sidebar and bottom bar on these.
 */
export const CHROMELESS_ROUTES = ["/", "/auth"] as const

export function isChromelessRoute(pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname === "/") return true
  return CHROMELESS_ROUTES.some((route) => route !== "/" && (pathname === route || pathname.startsWith(`${route}/`)))
}

/** `/marketplace/cart` should light up the Marketplace tab, so match on prefix. */
export function isActiveHref(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}
