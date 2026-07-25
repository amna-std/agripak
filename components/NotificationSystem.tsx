"use client"

/**
 * Notification bell + panel, backed by `GET /api/user/notifications`.
 *
 * The endpoint merges stored `Notification` documents with advisories derived
 * from the caller's own profile (incomplete profile, harvest window, the current
 * Rabi/Kharif season). Nothing here is invented client-side.
 *
 * There is no mark-read / delete endpoint yet, so the panel is read-only rather
 * than showing buttons that would silently do nothing. The badge counts stored
 * unread items only — that is what the API reports as `unreadCount`.
 *
 * Renders nothing for a signed-out visitor: the route is authenticated.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Bell, CloudSun, Info, Leaf, ShoppingBag, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { userApi, type NotificationItem } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const REFRESH_MS = 60_000

const TYPE_ICONS: Record<string, LucideIcon> = {
  weather: CloudSun,
  market: ShoppingBag,
  crop: Leaf,
  community: Users,
  account: Info,
  scheme: Info,
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive",
  high: "bg-warning/10 text-warning",
  medium: "bg-secondary text-secondary-foreground",
  low: "bg-muted text-muted-foreground",
}

export interface NotificationSystemProps {
  className?: string
}

export function NotificationSystem({ className }: NotificationSystemProps) {
  const { t } = useLanguage()
  const { user } = useAuth()

  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await userApi.getNotifications({ limit: 20 })
      if (res.success) {
        const data = res.data ?? []
        setItems(data)
        // The API's `unreadCount` counts stored documents only, because those are
        // the ones a future mark-read endpoint could clear. The badge instead
        // counts every unread row actually in the panel — a seasonal or harvest
        // advisory is just as unseen, and a silent bell would hide it.
        setUnreadCount(data.filter((item) => !item.isRead).length)
        setFailed(false)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setItems([])
      setUnreadCount(0)
      setLoading(false)
      return
    }
    setLoading(true)
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [user, load])

  /** Relative time, translated. Latin digits are kept so the numbers stay readable. */
  const relativeTime = (value: string | Date) => {
    const then = new Date(value).getTime()
    if (!Number.isFinite(then)) return ""
    const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000))
    if (minutes < 1) return t("common.justNow")
    if (minutes < 60) return t("common.minutesAgo", { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t("common.hoursAgo", { count: hours })
    return t("common.daysAgo", { count: Math.floor(hours / 24) })
  }

  if (!user) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative min-h-tap min-w-tap", className)}
          aria-label={
            unreadCount > 0 ? `${t("nav.notifications")} — ${t("common.unread", { count: unreadCount })}` : t("nav.notifications")
          }
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unreadCount > 0 ? (
            // `force-ltr` sets direction:ltr, so putting it on the positioned
            // element made `end-0.5` resolve against LTR and pinned the badge to
            // the right even in Urdu. It belongs on the digits only.
            <span
              className="absolute -top-0.5 end-0.5 min-w-[1.15rem] rounded-full bg-destructive px-1 text-[0.6875rem] font-bold leading-[1.15rem] text-destructive-foreground"
              aria-hidden
            >
              <span className="force-ltr">{unreadCount > 9 ? "9+" : unreadCount}</span>
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("nav.notifications")}</h2>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              {t("common.unread", { count: unreadCount })}
            </span>
          ) : null}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : failed ? (
            <div className="p-6 text-center">
              <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-warning" aria-hidden />
              <p className="text-sm text-muted-foreground">{t("common.notificationsError")}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={load}>
                {t("common.retry")}
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">{t("common.noNotifications")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const Icon = TYPE_ICONS[item.type] ?? Bell
                const body = (
                  <div className="flex items-start gap-3 px-4 py-3 text-start">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.medium,
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-sm font-semibold leading-[1.8]">{item.title}</span>
                        {!item.isRead ? (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-sm leading-[1.8] text-muted-foreground">{item.message}</span>
                      <time className="mt-1 block text-xs text-muted-foreground" dateTime={String(item.createdAt)}>
                        {relativeTime(item.createdAt)}
                      </time>
                    </span>
                  </div>
                )

                return (
                  <li key={item.id} className={cn(!item.isRead && "bg-secondary/40")}>
                    {item.actionUrl ? (
                      <Link href={item.actionUrl} className="block transition-colors hover:bg-muted">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default NotificationSystem
