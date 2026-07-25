"use client"

/**
 * AgriPak community feed.
 *
 * Everything on this page comes from the live API — there is no mock data:
 *   GET  /api/community/feed              the feed (public; personalised when signed in)
 *   POST /api/community/posts             create a post
 *   POST /api/community/posts/:id/react   toggle a reaction
 *   GET/POST /api/community/posts/:id/comments
 *
 * Reading is public. Posting, replying and reacting need a token, so the write
 * controls are replaced by a "log in" prompt for anonymous visitors instead of
 * failing on submit.
 *
 * Navigation chrome (header, sidebar, bottom bar) belongs to components/AppShell.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertTriangle,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Plus,
  Send,
  Sparkles,
  Stethoscope,
  ThumbsUp,
  Users,
} from "lucide-react"

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
import type { TranslationKey } from "@/lib/i18n"

/* -------------------------------------------------------------------- types */

interface PostAuthor {
  _id?: string
  name?: string
  role?: string
  profilePicture?: string | null
  district?: string | null
  state?: string | null
  village?: string | null
  qualification?: string | null
}

interface PostComment {
  _id?: string
  content?: string
  createdAt?: string
  author?: PostAuthor | null
}

interface PostReaction {
  _id?: string
  user?: string
  type?: string
}

interface CommunityPost {
  _id: string
  title?: string
  content?: string
  type?: string
  category?: string
  tags?: string[]
  views?: number
  createdAt?: string
  isPinned?: boolean
  isResolved?: boolean
  author?: PostAuthor | null
  comments?: PostComment[]
  reactions?: PostReaction[]
  reactionCount?: number
  commentCount?: number
}

type FeedType = "latest" | "trending" | "expert"

/* ---------------------------------------------------------------- constants */

const FEED_TABS: { value: FeedType; labelKey: TranslationKey }[] = [
  { value: "latest", labelKey: "community.feed" },
  { value: "trending", labelKey: "community.trending" },
  { value: "expert", labelKey: "community.expertAdvice" },
]

/** Mirrors POST_CATEGORIES in app/api/community/_lib/helpers.ts. */
const CATEGORIES: { value: string; labelKey: TranslationKey }[] = [
  { value: "crops", labelKey: "community.catCrops" },
  { value: "weather", labelKey: "community.catWeather" },
  { value: "market", labelKey: "community.catMarket" },
  { value: "government", labelKey: "community.catGovernment" },
  { value: "livestock", labelKey: "community.catLivestock" },
  { value: "equipment", labelKey: "community.catEquipment" },
  { value: "general", labelKey: "community.catGeneral" },
]

/** Mirrors POST_TYPES in app/api/community/_lib/helpers.ts. */
const POST_TYPES: { value: string; labelKey: TranslationKey }[] = [
  { value: "question", labelKey: "community.typeQuestion" },
  { value: "discussion", labelKey: "community.typeDiscussion" },
  { value: "problem", labelKey: "community.typeProblem" },
  { value: "tip", labelKey: "community.typeTip" },
  { value: "experience", labelKey: "community.typeExperience" },
  { value: "success_story", labelKey: "community.typeSuccessStory" },
]

const EXPERT_ROLES = ["expert", "agriculture_expert", "agri_doctor"]

const PAGE_SIZE = 10

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

function labelFor(list: { value: string; labelKey: TranslationKey }[], value?: string): TranslationKey | null {
  return list.find((item) => item.value === value)?.labelKey ?? null
}

/* ---------------------------------------------------------------- fragments */

function PostSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-3 w-1/4" />
          </div>
        </div>
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
      </CardContent>
    </Card>
  )
}

/* --------------------------------------------------------------------- page */

export default function CommunityPage() {
  const { t, formatNumber, currentLanguage } = useLanguage()
  const { user } = useAuth()

  const [feedType, setFeedType] = useState<FeedType>("latest")
  const [category, setCategory] = useState<string | null>(null)

  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [composerOpen, setComposerOpen] = useState(false)
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})

  const userId = String(user?._id ?? user?.id ?? "")

  /** Relative timestamp built from the shared common.* keys (all five locales). */
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

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (replace) {
        setLoading(true)
        setError(null)
      } else {
        setLoadingMore(true)
      }

      try {
        const res = await communityApi.getFeed({
          page: nextPage,
          limit: PAGE_SIZE,
          type: feedType === "latest" ? undefined : feedType,
          category: category ?? undefined,
        })

        if (!res.success) {
          setError(res.message || t("community.feedError"))
          if (replace) setPosts([])
          return
        }

        const incoming = (res.data ?? []) as CommunityPost[]
        setPosts((current) => (replace ? incoming : [...current, ...incoming]))
        setHasMore(Boolean(res.pagination?.hasMore))
        setPage(nextPage)
      } catch {
        setError(t("validation.networkError"))
        if (replace) setPosts([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [category, feedType, t],
  )

  useEffect(() => {
    void load(1, true)
  }, [load])

  const handleCreated = (post: CommunityPost) => {
    setPosts((current) => [post, ...current])
    setComposerOpen(false)
    toast.success(t("community.postCreated"))
  }

  const handleReacted = (postId: string, reactionCount: number, userReaction: string | null) => {
    setPosts((current) =>
      current.map((post) => {
        if (post._id !== postId) return post
        const others = (post.reactions ?? []).filter((r) => String(r.user) !== userId)
        return {
          ...post,
          reactionCount,
          reactions: userReaction ? [...others, { user: userId, type: userReaction }] : others,
        }
      }),
    )
  }

  const handleCommented = (postId: string, comment: PostComment, commentCount: number) => {
    setPosts((current) =>
      current.map((post) =>
        post._id === postId ? { ...post, comments: [...(post.comments ?? []), comment], commentCount } : post,
      ),
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      {/* ------------------------------------------------------------ header */}
      <header className="mb-5">
        <h1 className="text-2xl font-bold leading-[1.6] text-foreground sm:text-3xl">{t("community.title")}</h1>
        <p className="mt-1 text-sm leading-[1.8] text-muted-foreground">{t("community.subtitle")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {user ? (
            <Button className="min-h-tap flex-1 sm:flex-none" onClick={() => setComposerOpen(true)}>
              <Plus className="me-2 h-5 w-5" aria-hidden />
              {t("community.createPost")}
            </Button>
          ) : (
            <Button asChild className="min-h-tap flex-1 sm:flex-none">
              <Link href="/auth/login">{t("auth.login")}</Link>
            </Button>
          )}

          <Button asChild variant="outline" className="min-h-tap">
            <Link href="/forum">
              <MessagesSquare className="me-2 h-4 w-4" aria-hidden />
              {t("community.openForum")}
            </Link>
          </Button>

          <Button asChild variant="outline" className="min-h-tap">
            <Link href="/consultations">
              <Stethoscope className="me-2 h-4 w-4" aria-hidden />
              {t("community.openConsultations")}
            </Link>
          </Button>
        </div>
      </header>

      {/* -------------------------------------------------------------- tabs */}
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist">
        {FEED_TABS.map((tab) => {
          const active = feedType === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFeedType(tab.value)}
              className={`min-h-tap rounded-lg px-2 py-2 text-xs font-semibold leading-[1.8] transition-colors sm:text-sm ${
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {/* -------------------------------------------------------- categories */}
      <div className="scroll-x no-scrollbar -mx-4 mb-5 px-4 sm:-mx-6 sm:px-6">
        <div className="flex w-max gap-2 pb-1">
          <button
            type="button"
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
            className={`min-h-tap whitespace-nowrap rounded-full border px-4 text-sm font-medium leading-[1.8] transition-colors ${
              category === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("community.allCategories")}
          </button>
          {CATEGORIES.map((item) => {
            const active = category === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(active ? null : item.value)}
                aria-pressed={active}
                className={`min-h-tap whitespace-nowrap rounded-full border px-4 text-sm font-medium leading-[1.8] transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(item.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      {/* -------------------------------------------------------------- feed */}
      {loading ? (
        <div className="space-y-3">
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
            <p className="text-sm leading-[1.8] text-muted-foreground">{error}</p>
            <Button variant="outline" className="min-h-tap" onClick={() => void load(1, true)}>
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Users className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="text-sm leading-[1.8] text-muted-foreground">{t("community.noPosts")}</p>
            {user ? (
              <Button className="min-h-tap" onClick={() => setComposerOpen(true)}>
                <Plus className="me-2 h-5 w-5" aria-hidden />
                {t("community.createPost")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              userId={userId}
              signedIn={Boolean(user)}
              expanded={Boolean(openComments[post._id])}
              onToggleComments={() =>
                setOpenComments((current) => ({ ...current, [post._id]: !current[post._id] }))
              }
              onReacted={handleReacted}
              onCommented={handleCommented}
              timeAgo={timeAgo}
              formatNumber={formatNumber}
              t={t}
              lang={currentLanguage}
            />
          ))}

          {hasMore ? (
            <Button
              variant="outline"
              className="min-h-tap w-full"
              disabled={loadingMore}
              onClick={() => void load(page + 1, false)}
            >
              {loadingMore ? <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("community.loadMore")}
            </Button>
          ) : null}
        </div>
      )}

      <ComposerDialog open={composerOpen} onOpenChange={setComposerOpen} onCreated={handleCreated} />
    </div>
  )
}

/* ---------------------------------------------------------------- post card */

interface PostCardProps {
  post: CommunityPost
  userId: string
  signedIn: boolean
  expanded: boolean
  onToggleComments: () => void
  onReacted: (postId: string, reactionCount: number, userReaction: string | null) => void
  onCommented: (postId: string, comment: PostComment, commentCount: number) => void
  timeAgo: (value?: string) => string
  formatNumber: (value: number | string) => string
  t: (key: TranslationKey | (string & {}), vars?: Record<string, string | number>) => string
  lang: string
}

function PostCard({
  post,
  userId,
  signedIn,
  expanded,
  onToggleComments,
  onReacted,
  onCommented,
  timeAgo,
  formatNumber,
  t,
  lang,
}: PostCardProps) {
  const [reacting, setReacting] = useState(false)
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)

  const author = post.author
  const authorName = author?.name || t("community.deletedAuthor")
  const isExpertAuthor = EXPERT_ROLES.includes(author?.role ?? "")
  const place = [author?.district, author?.state].filter(Boolean).join(", ")

  const myReaction = useMemo(
    () => (post.reactions ?? []).find((r) => String(r.user) === userId)?.type ?? null,
    [post.reactions, userId],
  )

  const categoryKey = labelFor(CATEGORIES, post.category)
  const typeKey = labelFor(POST_TYPES, post.type)
  const comments = post.comments ?? []

  const react = async () => {
    if (!signedIn) {
      toast.error(t("community.loginToPost"))
      return
    }
    setReacting(true)
    try {
      const res = await communityApi.react(post._id, "helpful")
      if (!res.success) {
        toast.error(res.message || t("validation.somethingWentWrong"))
        return
      }
      const data = (res.data ?? {}) as { reactionCount?: number; userReaction?: string | null }
      onReacted(post._id, data.reactionCount ?? post.reactionCount ?? 0, data.userReaction ?? null)
    } catch {
      toast.error(t("validation.networkError"))
    } finally {
      setReacting(false)
    }
  }

  const submitComment = async () => {
    const text = comment.trim()
    if (!text) return
    setSending(true)
    try {
      const res = await communityApi.addComment(post._id, text)
      if (!res.success) {
        toast.error(res.message || t("validation.somethingWentWrong"))
        return
      }
      onCommented(post._id, (res.data ?? {}) as PostComment, res.commentCount ?? comments.length + 1)
      setComment("")
    } catch {
      toast.error(t("validation.networkError"))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {/* author row */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
          >
            {initials(author?.name)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold leading-[1.8] text-foreground">{authorName}</span>
              {isExpertAuthor ? (
                <Badge className="bg-gold-gradient border-transparent text-[11px] leading-[1.7]">
                  {t("auth.expert")}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs leading-[1.8] text-muted-foreground">
              {[place, timeAgo(post.createdAt)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {/* body */}
        <h2 className="mt-3 text-base font-bold leading-[1.7] text-foreground">{post.title}</h2>
        <p className="mt-1 whitespace-pre-line text-sm leading-[1.9] text-muted-foreground">{post.content}</p>

        {/* meta */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {categoryKey ? (
            <Badge variant="secondary" className="text-[11px] leading-[1.7]">
              {t(categoryKey)}
            </Badge>
          ) : null}
          {typeKey ? (
            <Badge variant="outline" className="text-[11px] leading-[1.7]">
              {t(typeKey)}
            </Badge>
          ) : null}
          {(post.tags ?? []).slice(0, 4).map((tag) => (
            <span key={tag} className="text-xs leading-[1.8] text-primary">
              #{tag}
            </span>
          ))}
        </div>

        {/* actions */}
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => void react()}
            disabled={reacting}
            aria-pressed={Boolean(myReaction)}
            className={`min-h-tap flex items-center gap-2 rounded-lg px-3 text-sm font-medium leading-[1.8] transition-colors ${
              myReaction ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ThumbsUp className={`h-4 w-4 ${myReaction ? "fill-current" : ""}`} aria-hidden />
            <span>{t("community.helpful")}</span>
            {post.reactionCount ? <span className="force-ltr">{formatNumber(post.reactionCount)}</span> : null}
          </button>

          <button
            type="button"
            onClick={onToggleComments}
            aria-expanded={expanded}
            className="min-h-tap flex items-center gap-2 rounded-lg px-3 text-sm font-medium leading-[1.8] text-muted-foreground transition-colors hover:text-foreground"
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            <span>{expanded ? t("community.hideComments") : t("community.showComments")}</span>
            {post.commentCount ? <span className="force-ltr">{formatNumber(post.commentCount)}</span> : null}
          </button>
        </div>

        {/* comments */}
        {expanded ? (
          <div className="mt-3 space-y-3 rounded-lg bg-muted/50 p-3">
            {comments.length === 0 ? (
              <p className="text-sm leading-[1.8] text-muted-foreground">{t("community.noComments")}</p>
            ) : (
              comments.map((item, index) => (
                <div key={item._id ?? `${post._id}-comment-${index}`} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-xs font-bold text-primary"
                  >
                    {initials(item.author?.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-[1.8] text-foreground">
                      {item.author?.name || t("community.deletedAuthor")}
                      <span className="ms-2 font-normal text-muted-foreground">{timeAgo(item.createdAt)}</span>
                    </p>
                    <p className="text-sm leading-[1.9] text-muted-foreground">{item.content}</p>
                  </div>
                </div>
              ))
            )}

            {signedIn ? (
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitComment()
                }}
              >
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("community.commentPlaceholder")}
                  rows={2}
                  maxLength={1000}
                  lang={lang}
                  className="min-h-[44px] resize-none text-sm leading-[1.9]"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="tap-target shrink-0"
                  disabled={sending || !comment.trim()}
                  aria-label={t("community.addComment")}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="flip-rtl h-4 w-4" aria-hidden />
                  )}
                </Button>
              </form>
            ) : (
              <Link
                href="/auth/login"
                className="block text-sm font-semibold leading-[1.8] text-primary underline underline-offset-4"
              >
                {t("community.loginToPost")}
              </Link>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ----------------------------------------------------------------- composer */

function ComposerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  onCreated: (post: CommunityPost) => void
}) {
  const { t, currentLanguage } = useLanguage()

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [type, setType] = useState("question")
  const [category, setCategory] = useState("crops")
  const [tags, setTags] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const reset = () => {
    setTitle("")
    setContent("")
    setType("question")
    setCategory("crops")
    setTags("")
    setFormError(null)
  }

  const submit = async () => {
    setFormError(null)

    if (title.trim().length < 5 || content.trim().length < 10) {
      setFormError(t("validation.tooShort"))
      return
    }

    setSaving(true)
    try {
      const res = await communityApi.createPost({
        title: title.trim(),
        content: content.trim(),
        type,
        category,
        language: currentLanguage,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })

      if (!res.success || !res.data) {
        setFormError(res.message || t("validation.somethingWentWrong"))
        return
      }

      onCreated(res.data as CommunityPost)
      reset()
    } catch {
      setFormError(t("validation.networkError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)
        if (!value) reset()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle className="leading-[1.7]">{t("community.createPost")}</DialogTitle>
          <DialogDescription className="leading-[1.8]">{t("community.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="post-type" className="leading-[1.8]">
                {t("community.postType")}
              </Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="post-type" className="min-h-tap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="min-h-tap">
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="post-category" className="leading-[1.8]">
                {t("marketplace.category")}
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="post-category" className="min-h-tap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="min-h-tap">
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="post-title" className="leading-[1.8]">
              {t("community.postTitle")}
            </Label>
            <Input
              id="post-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("community.titlePlaceholder")}
              maxLength={200}
              className="min-h-tap leading-[1.8]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="post-content" className="leading-[1.8]">
              {t("community.postContent")}
            </Label>
            <Textarea
              id="post-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t("community.contentPlaceholder")}
              rows={5}
              maxLength={5000}
              className="leading-[1.9]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="post-tags" className="leading-[1.8]">
              {t("community.tags")} <span className="text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input
              id="post-tags"
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
            {saving ? t("community.posting") : t("community.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
