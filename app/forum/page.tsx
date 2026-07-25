"use client"

/**
 * AgriPak discussion boards.
 *
 * This page used to call `/api/forum`, a route that never existed in the App
 * Router rebuild, so it always rendered "No topics found". It now talks to the
 * real endpoint:
 *   GET  /api/community/topics?type=categories   the board list
 *   GET  /api/community/topics?categoryId=&search=   topics
 *   POST /api/community/topics                   start a topic
 *
 * There is no reply endpoint yet, so existing replies are shown read-only and
 * no "post a reply" control is offered — a button that cannot work is worse
 * than no button (AGENT_CONTRACT.md rule 6).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, Eye, Loader2, Lock, MessageSquare, Pin, Plus, Search, Users } from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { communityApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/* -------------------------------------------------------------------- types */

interface ForumCategory {
  _id: string
  name: string
  description?: string
  icon?: string
  color?: string
  postCount?: number
  lastActivity?: string
}

interface TopicAuthor {
  _id?: string
  name?: string
  role?: string
  district?: string | null
  state?: string | null
}

interface TopicReply {
  _id?: string
  content?: string
  createdAt?: string
  isAcceptedAnswer?: boolean
}

interface ForumTopic {
  _id: string
  title: string
  content?: string
  tags?: string[]
  views?: number
  isPinned?: boolean
  isLocked?: boolean
  isSolved?: boolean
  createdAt?: string
  updatedAt?: string
  author?: TopicAuthor | null
  category?: ForumCategory | null
  replies?: TopicReply[]
  lastReply?: { createdAt?: string; author?: { name?: string } | null }
}

/* ------------------------------------------------------------------ helpers */

function initials(name?: string | null): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase()
}

function TopicSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-3 w-1/2" />
      </CardContent>
    </Card>
  )
}

/* --------------------------------------------------------------------- page */

export default function ForumPage() {
  const { t, formatNumber } = useLanguage()
  const { user } = useAuth()

  const [categories, setCategories] = useState<ForumCategory[]>([])
  const [topics, setTopics] = useState<ForumTopic[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const timeAgo = useCallback(
    (value?: string) => {
      if (!value) return ""
      const then = new Date(value).getTime()
      if (Number.isNaN(then)) return ""
      const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000))
      if (minutes < 1) return t("common.justNow")
      if (minutes < 60) return t("common.minutesAgo", { count: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 24) return t("common.hoursAgo", { count: hours })
      return t("common.daysAgo", { count: Math.round(hours / 24) })
    },
    [t],
  )

  /* The search box is debounced so every keystroke does not hit the API. */
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await communityApi.getTopics({ type: "categories" })
        if (!cancelled && res.success) setCategories((res.data ?? []) as ForumCategory[])
      } catch {
        /* the topic list below surfaces the error state; boards just stay empty */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadTopics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await communityApi.getTopics({
        categoryId: categoryId ?? undefined,
        search: search.length >= 2 ? search : undefined,
        limit: 30,
      })
      if (!res.success) {
        setError(res.message || t("forum.loadError"))
        setTopics([])
        return
      }
      setTopics((res.data ?? []) as ForumTopic[])
    } catch {
      setError(t("validation.networkError"))
      setTopics([])
    } finally {
      setLoading(false)
    }
  }, [categoryId, search, t])

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  const activeCategory = useMemo(
    () => categories.find((item) => item._id === categoryId) ?? null,
    [categories, categoryId],
  )

  const handleCreated = (topic: ForumTopic) => {
    setTopics((current) => [topic, ...current])
    setComposerOpen(false)
    toast.success(t("forum.topicCreated"))
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      {/* ------------------------------------------------------------ header */}
      <header className="mb-5">
        <h1 className="text-2xl font-bold leading-[1.6] text-foreground sm:text-3xl">{t("forum.title")}</h1>
        <p className="mt-1 text-sm leading-[1.8] text-muted-foreground">{t("forum.subtitle")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {user ? (
            <Button className="min-h-tap flex-1 sm:flex-none" onClick={() => setComposerOpen(true)}>
              <Plus className="me-2 h-5 w-5" aria-hidden />
              {t("forum.newTopic")}
            </Button>
          ) : (
            <Button asChild className="min-h-tap flex-1 sm:flex-none">
              <Link href="/auth/login">{t("forum.loginToStart")}</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="min-h-tap">
            <Link href="/community">
              <Users className="me-2 h-4 w-4" aria-hidden />
              {t("community.title")}
            </Link>
          </Button>
        </div>
      </header>

      {/* ------------------------------------------------------------ search */}
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("forum.searchPlaceholder")}
          aria-label={t("forum.searchPlaceholder")}
          className="min-h-tap ps-10 leading-[1.8]"
        />
      </div>

      {/* ------------------------------------------------------------ boards */}
      <div className="scroll-x no-scrollbar -mx-4 mb-2 px-4 sm:-mx-6 sm:px-6">
        <div className="flex w-max gap-2 pb-1">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            aria-pressed={categoryId === null}
            className={`min-h-tap whitespace-nowrap rounded-full border px-4 text-sm font-medium leading-[1.8] transition-colors ${
              categoryId === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("forum.allBoards")}
          </button>
          {categories.map((item) => {
            const active = categoryId === item._id
            return (
              <button
                key={item._id}
                type="button"
                onClick={() => setCategoryId(active ? null : item._id)}
                aria-pressed={active}
                className={`min-h-tap whitespace-nowrap rounded-full border px-4 text-sm font-medium leading-[1.8] transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.name}
                {item.postCount ? (
                  <span className="force-ltr ms-2 text-xs opacity-80">{formatNumber(item.postCount)}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {activeCategory?.description ? (
        <p className="mb-4 rounded-lg border-s-accent bg-muted/60 px-3 py-2 text-sm leading-[1.9] text-muted-foreground">
          {activeCategory.description}
        </p>
      ) : (
        <div className="mb-4" />
      )}

      {/* ------------------------------------------------------------ topics */}
      {loading ? (
        <div className="space-y-3">
          <TopicSkeleton />
          <TopicSkeleton />
          <TopicSkeleton />
        </div>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
            <p className="text-sm leading-[1.8] text-muted-foreground">{error}</p>
            <Button variant="outline" className="min-h-tap" onClick={() => void loadTopics()}>
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : topics.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="text-sm leading-[1.8] text-muted-foreground">
              {search.length >= 2 ? t("forum.noTopicsSearch") : t("forum.noTopics")}
            </p>
            {user ? (
              <Button className="min-h-tap" onClick={() => setComposerOpen(true)}>
                <Plus className="me-2 h-5 w-5" aria-hidden />
                {t("forum.newTopic")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {topics.map((topic) => {
            const open = Boolean(expanded[topic._id])
            const replies = topic.replies ?? []
            const authorName = topic.author?.name || t("forum.deletedAuthor")
            const place = [topic.author?.district, topic.author?.state].filter(Boolean).join(", ")

            return (
              <li key={topic._id}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {topic.isPinned ? (
                        <Badge variant="secondary" className="gap-1 text-[11px] leading-[1.7]">
                          <Pin className="h-3 w-3" aria-hidden />
                          {t("forum.pinned")}
                        </Badge>
                      ) : null}
                      {topic.isSolved ? (
                        <Badge className="bg-primary text-[11px] leading-[1.7]">{t("forum.solved")}</Badge>
                      ) : null}
                      {topic.isLocked ? (
                        <Badge variant="outline" className="gap-1 text-[11px] leading-[1.7]">
                          <Lock className="h-3 w-3" aria-hidden />
                          {t("forum.locked")}
                        </Badge>
                      ) : null}
                      {topic.category?.name ? (
                        <Badge variant="outline" className="text-[11px] leading-[1.7]">
                          {topic.category.name}
                        </Badge>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpanded((current) => ({ ...current, [topic._id]: !current[topic._id] }))}
                      aria-expanded={open}
                      className="mt-2 block w-full text-start"
                    >
                      <h2 className="text-base font-bold leading-[1.7] text-foreground">{topic.title}</h2>
                    </button>

                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs leading-[1.8] text-muted-foreground">
                      <span
                        aria-hidden
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary"
                      >
                        {initials(topic.author?.name)}
                      </span>
                      <span>
                        {t("forum.startedBy")} {authorName}
                      </span>
                      {place ? <span>· {place}</span> : null}
                      <span>· {timeAgo(topic.createdAt)}</span>
                    </p>

                    {open ? (
                      <div className="mt-3 space-y-3">
                        <p className="whitespace-pre-line text-sm leading-[1.9] text-muted-foreground">
                          {topic.content}
                        </p>

                        {replies.length ? (
                          <ul className="space-y-2 rounded-lg bg-muted/50 p-3">
                            {replies.map((reply, index) => (
                              <li key={reply._id ?? `${topic._id}-reply-${index}`}>
                                <p className="text-sm leading-[1.9] text-muted-foreground">{reply.content}</p>
                                <p className="text-xs leading-[1.8] text-muted-foreground/80">
                                  {timeAgo(reply.createdAt)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

                    {(topic.tags ?? []).length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(topic.tags ?? []).slice(0, 5).map((tag) => (
                          <span key={tag} className="text-xs leading-[1.8] text-primary">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-2 text-xs leading-[1.8] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" aria-hidden />
                        {t("forum.replies")}
                        <span className="force-ltr">{formatNumber(replies.length)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-4 w-4" aria-hidden />
                        {t("forum.views")}
                        <span className="force-ltr">{formatNumber(topic.views ?? 0)}</span>
                      </span>
                      <span>
                        {t("forum.lastActivity")}: {timeAgo(topic.lastReply?.createdAt || topic.updatedAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <TopicDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        categories={categories}
        defaultCategoryId={categoryId}
        onCreated={handleCreated}
      />
    </div>
  )
}

/* ----------------------------------------------------------- topic composer */

function TopicDialog({
  open,
  onOpenChange,
  categories,
  defaultCategoryId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  categories: ForumCategory[]
  defaultCategoryId: string | null
  onCreated: (topic: ForumTopic) => void
}) {
  const { t } = useLanguage()

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "")
  const [tags, setTags] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setCategoryId(defaultCategoryId ?? "")
  }, [open, defaultCategoryId])

  const submit = async () => {
    setFormError(null)

    if (!categoryId) {
      setFormError(t("validation.required"))
      return
    }
    if (title.trim().length < 5 || content.trim().length < 10) {
      setFormError(t("validation.tooShort"))
      return
    }

    setSaving(true)
    try {
      const res = await communityApi.createTopic({
        title: title.trim(),
        content: content.trim(),
        categoryId,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })

      if (!res.success || !res.data) {
        setFormError(res.message || t("validation.somethingWentWrong"))
        return
      }

      onCreated(res.data as ForumTopic)
      setTitle("")
      setContent("")
      setTags("")
    } catch {
      setFormError(t("validation.networkError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle className="leading-[1.7]">{t("forum.newTopic")}</DialogTitle>
          <DialogDescription className="leading-[1.8]">{t("forum.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="topic-board" className="leading-[1.8]">
              {t("forum.selectBoard")}
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="topic-board" className="min-h-tap">
                <SelectValue placeholder={t("forum.selectBoard")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item._id} value={item._id} className="min-h-tap">
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="topic-title" className="leading-[1.8]">
              {t("forum.topicTitle")}
            </Label>
            <Input
              id="topic-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              className="min-h-tap leading-[1.8]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="topic-content" className="leading-[1.8]">
              {t("forum.topicContent")}
            </Label>
            <Textarea
              id="topic-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={6}
              maxLength={5000}
              className="leading-[1.9]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="topic-tags" className="leading-[1.8]">
              {t("community.tags")} <span className="text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input
              id="topic-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t("community.tagsPlaceholder")}
              className="min-h-tap leading-[1.8]"
            />
          </div>

          {formError ? (
            <p role="alert" className="text-sm leading-[1.8] text-destructive">
              {formError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="min-h-tap" disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {saving ? t("forum.creating") : t("forum.newTopic")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
