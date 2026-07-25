/**
 * AgriPak API client.
 *
 * One axios instance (`export default api`) plus a typed helper per backend
 * domain. Every route lives under `/api/*` in this same Next.js app, so the
 * base URL is relative and works unchanged on localhost and on Vercel.
 *
 * Contract shared by every endpoint (see lib/api-helpers.ts):
 *     success -> { success: true,  ...payload }
 *     failure -> { success: false, message: "..." }
 *
 * Helpers therefore resolve to `ApiResult<T>` — the payload widened with
 * `success`/`message` — and never throw for a handled API failure. A network
 * error or a 5xx still rejects, so wrap calls in try/catch and render an honest
 * error state; do not fall back to invented numbers.
 *
 *   const res = await weatherApi.getCurrent({ city: "Faisalabad" })
 *   if (!res.success) return <ErrorState message={res.message} />
 *
 * Auth: the bearer token is read from `localStorage["token"]` on every request.
 * A 401 clears the stored session so the app drops back to logged-out state.
 *
 * NOTE: `lib/marketApi.ts`, `lib/communityApi.ts`, `lib/cropApi.ts`,
 * `lib/diseaseApi.ts`, `lib/schemesApi.ts` and `lib/assistantApi.ts` import the
 * default export from here — keep it an axios instance.
 */

import axios, { type AxiosRequestConfig } from "axios"

/* --------------------------------------------------------------- instance */

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
})

export const TOKEN_STORAGE_KEY = "token"
export const USER_STORAGE_KEY = "user"

/** SSR-safe read of the bearer token. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Persist (or clear, when passed `null`) the bearer token. */
export function setToken(token: string | null): void {
  if (typeof window === "undefined") return
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* private mode — the session just will not survive a reload */
  }
}

/** Drops the stored session. Called on 401 and by `logout()`. */
export function clearSession(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    window.localStorage.removeItem(USER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A rejected token is worthless — drop it so AuthContext stops showing a
    // stale user. Redirecting is left to the page (it knows if it is protected).
    if (error?.response?.status === 401) clearSession()
    return Promise.reject(error)
  },
)

export default api

/* ------------------------------------------------------------------ types */

/** Every route answers with at least these two fields. */
export interface ApiEnvelope {
  success: boolean
  message?: string
}

/** A successful payload widened with the envelope. */
export type ApiResult<T = Record<string, unknown>> = ApiEnvelope & Partial<T>

/** Query values; `undefined` and `""` are dropped rather than sent as empty params. */
export type Query = Record<string, string | number | boolean | null | undefined>

function toQuery(params?: Query): string {
  if (!params) return ""
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

/**
 * Runs a request and always resolves to the envelope.
 *
 * A 4xx that the API answered with `{ success:false, message }` is returned as
 * data — that is a normal, displayable outcome, not an exception. Anything else
 * (network down, HTML error page, 5xx without a body) rejects.
 */
async function request<T>(config: AxiosRequestConfig): Promise<ApiResult<T>> {
  try {
    const response = await api.request<ApiResult<T>>(config)
    return response.data
  } catch (error: any) {
    const data = error?.response?.data
    if (data && typeof data === "object" && "success" in data) {
      return data as ApiResult<T>
    }
    throw error
  }
}

const get = <T>(url: string, params?: Query) => request<T>({ url: url + toQuery(params), method: "GET" })
const post = <T>(url: string, data?: unknown) => request<T>({ url, method: "POST", data })
const put = <T>(url: string, data?: unknown) => request<T>({ url, method: "PUT", data })

/* ------------------------------------------------------------------- auth */

export interface LoginCredentials {
  /** Pakistani mobile, `03XXXXXXXXX`. */
  mobile?: string
  email?: string
  password: string
}

export interface AuthPayload {
  token: string
  user: Record<string, any>
}

export const authApi = {
  login: (credentials: LoginCredentials) => post<AuthPayload>("/auth/login", credentials),
  register: (userData: Record<string, any>) => post<AuthPayload>("/auth/register", userData),
  getMe: () => get<{ user: Record<string, any> }>("/auth/me"),
}

/* ------------------------------------------------------------------- user */

export const userApi = {
  /** GET /api/user/profile — the caller's own record. */
  getProfile: () => get<{ user: Record<string, any>; country: string; province?: string }>("/user/profile"),
  /** PUT /api/user/profile */
  updateProfile: (data: Record<string, any>) => put<{ user: Record<string, any> }>("/user/profile", data),
  /** GET /api/user/dashboard — the aggregated home-screen payload. */
  getDashboard: () => get<{ data: Record<string, any> }>("/user/dashboard"),
  /** GET /api/user/notifications — stored alerts merged with derived advisories. */
  getNotifications: (params?: { unreadOnly?: boolean; limit?: number }) =>
    get<{ data: NotificationItem[]; unreadCount: number; total: number; season: string }>(
      "/user/notifications",
      params as Query,
    ),
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  priority: "low" | "medium" | "high" | "urgent" | string
  isRead: boolean
  actionUrl?: string
  createdAt: string
  /** `db` = stored, `derived` = computed from the caller's own record. */
  source: "db" | "derived"
}

/* ---------------------------------------------------------------- weather */

/** Either a saved city (`city`/`slug`) or raw coordinates. Never defaults to one city. */
export interface WeatherLocationQuery {
  city?: string
  slug?: string
  lat?: number
  lon?: number
  province?: string
}

export const weatherApi = {
  getCurrent: (params?: WeatherLocationQuery) => get<{ data: Record<string, any> }>("/weather/current", params as Query),
  getForecast: (params?: WeatherLocationQuery & { days?: number; crop?: string }) =>
    get<{ data: Record<string, any> }>("/weather/forecast", params as Query),
  getAlerts: (params?: WeatherLocationQuery & { crop?: string }) =>
    get<{ data: Record<string, any> }>("/weather/alerts", params as Query),
  /** All Pakistani cities the weather service covers, grouped by province. */
  getLocations: (params?: { province?: string; search?: string }) =>
    get<{ data: any[]; provinces: Record<string, any[]>; defaultLocation: Record<string, any>; count: number }>(
      "/weather/locations",
      params as Query,
    ),
}

/* ----------------------------------------------------------------- market */

export interface MarketQuery {
  commodity?: string
  market?: string
  province?: string
  district?: string
  limit?: number
  days?: number
}

export const marketApi = {
  /** AMIS mandi rates, PKR per 100 kg. `source` is `amis | cache | sample`. */
  getPrices: (params?: MarketQuery) =>
    get<{ prices: any[]; source: string; currency: string; unit: string; lastUpdated: string; totalRecords: number }>(
      "/market/prices",
      params as Query,
    ),
  getTrends: (params?: MarketQuery) =>
    get<{ trends: any[]; source: string; currency: string; unit: string; days: number }>(
      "/market/trends",
      params as Query,
    ),
}

/* ------------------------------------------------------------------ crops */

export const cropsApi = {
  list: (params?: Query) => get<{ data: Record<string, any> }>("/crops", params),
  get: (cropId: string) => get<{ data: Record<string, any> }>(`/crops/${encodeURIComponent(cropId)}`),
  getRecommendations: (params?: Query) => get<{ data: Record<string, any> }>("/crops/recommendations", params),
  getCalendar: (params?: { province?: string; season?: string; month?: number }) =>
    get<{ data: Record<string, any> }>("/crops/calendar", params as Query),
}

/* ---------------------------------------------------------------- schemes */

export interface EligibilityInput {
  province?: string
  landSizeAcres?: number
  tenure?: string
  hasLandRecord?: boolean
  schemeIds?: string[]
}

export const schemesApi = {
  list: (params?: Query) => get<{ data: Record<string, any> }>("/schemes", params),
  get: (id: string) => get<{ data: Record<string, any> }>(`/schemes/${encodeURIComponent(id)}`),
  checkEligibility: (input: EligibilityInput) => post<{ data: Record<string, any> }>("/schemes/check-eligibility", input),
}

/* ------------------------------------------------------------ marketplace */

export const marketplaceApi = {
  getProducts: (params?: Query) =>
    get<{ products: any[]; currency: string; pagination: Record<string, number> }>("/marketplace/products", params),
  createProduct: (data: Record<string, any>) => post<{ product: Record<string, any> }>("/marketplace/products", data),
  /** Farmer-to-buyer crop listings (distinct from the input-supply products above). */
  getListings: (params?: Query) =>
    get<{ listings: any[]; currency: string; pagination: Record<string, number> }>("/marketplace/listings", params),
  createListing: (data: Record<string, any>) => post<{ listing: Record<string, any> }>("/marketplace/listings", data),
  getOrders: (params?: { as?: "buyer" | "seller"; page?: number; limit?: number }) =>
    get<{ orders: any[]; role: string; currency: string; pagination: Record<string, number> }>(
      "/marketplace/orders",
      params as Query,
    ),
  createOrder: (data: Record<string, any>) => post<{ order: Record<string, any> }>("/marketplace/orders", data),
}

/* ------------------------------------------------------------- community */

export const communityApi = {
  getFeed: (params?: Query) => get<{ data: any[]; pagination: Record<string, any> }>("/community/feed", params),
  getPosts: (params?: Query) => get<{ data: any[]; pagination: Record<string, any> }>("/community/posts", params),
  createPost: (data: Record<string, any>) => post<{ data: Record<string, any> }>("/community/posts", data),
  getPost: (postId: string) => get<{ data: Record<string, any> }>(`/community/posts/${encodeURIComponent(postId)}`),
  getComments: (postId: string) => get<{ data: any[] }>(`/community/posts/${encodeURIComponent(postId)}/comments`),
  addComment: (postId: string, content: string) =>
    post<{ data: Record<string, any>; commentCount: number }>(
      `/community/posts/${encodeURIComponent(postId)}/comments`,
      { content },
    ),
  react: (postId: string, type: string) =>
    post<{ data: Record<string, any> }>(`/community/posts/${encodeURIComponent(postId)}/react`, { type }),
  getTopics: (params?: Query) => get<{ data: any[]; pagination?: Record<string, any> }>("/community/topics", params),
  createTopic: (data: Record<string, any>) => post<{ data: Record<string, any> }>("/community/topics", data),
  getGroups: (params?: Query) => get<{ data: any[]; pagination: Record<string, any> }>("/community/groups", params),
  createGroup: (data: Record<string, any>) => post<{ data: Record<string, any> }>("/community/groups", data),
  joinGroup: (groupId: string) => post<{ data: Record<string, any> }>(`/community/groups/${encodeURIComponent(groupId)}/join`),
  leaveGroup: (groupId: string) =>
    post<{ data: Record<string, any> }>(`/community/groups/${encodeURIComponent(groupId)}/leave`),
  search: (q: string, params?: Query) => get<{ data: any[]; pagination: Record<string, any> }>("/community/search", { q, ...params }),
  getTrending: (limit?: number) => get<{ data: { posts: any[]; tags: any[] } }>("/community/trending", { limit }),
}

/* ---------------------------------------------------------- consultations */

export const consultationsApi = {
  list: (params?: Query) => get<{ data: any[]; consultations: any[]; pagination: Record<string, any> }>("/consultations", params),
  create: (data: Record<string, any>) => post<{ data: Record<string, any> }>("/consultations", data),
  get: (id: string) => get<{ data: Record<string, any> }>(`/consultations/${encodeURIComponent(id)}`),
  getMessages: (id: string) => get<{ data: any[] }>(`/consultations/${encodeURIComponent(id)}/messages`),
  sendMessage: (id: string, data: Record<string, any>) =>
    post<{ data: Record<string, any>; messages: any[] }>(`/consultations/${encodeURIComponent(id)}/messages`, data),
  getRecommendations: (id: string) => get<{ data: any[] }>(`/consultations/${encodeURIComponent(id)}/recommendations`),
  addRecommendation: (id: string, data: Record<string, any>) =>
    post<{ data: Record<string, any> }>(`/consultations/${encodeURIComponent(id)}/recommendations`, data),
}

/* ----------------------------------------------------------------- expert */

export const expertApi = {
  list: (params?: Query) =>
    get<{ data: any[]; source: string; isSample?: boolean; pagination: Record<string, number> }>("/expert", params),
  register: (data: Record<string, any>) => post<{ data: Record<string, any> }>("/expert/register", data),
}

/* --------------------------------------------------------------------- AI */

export interface ChatTurn {
  role: "user" | "model"
  text: string
}

export interface ChatResponse {
  reply: string
  /** Alias of `reply`, kept for the older assistant UI. */
  response: string
  sessionId: string
  language: string
  model: string
  truncated: boolean
  saved: boolean
  authenticated: boolean
  suggestedQuestions: string[]
}

export interface DiagnoseResponse {
  parsed: boolean
  isPlant: boolean
  imageQuality: string
  disease: string
  confidence: number
  severity: string
  symptoms: string[]
  treatment: string[]
  prevention: string[]
  organicOptions: string[]
  farmerSummary: string
  disclaimer: string
  rawAnalysis?: string
}

export const aiApi = {
  /** POST /api/ai/chat — the conversational assistant. Auth is optional. */
  chat: (payload: { message: string; history?: ChatTurn[]; language?: string; sessionId?: string }) =>
    post<ChatResponse>("/ai/chat", payload),
  /** GET /api/ai/chat — replay saved conversations (auth required). */
  getConversations: (sessionId?: string) => get<Record<string, any>>("/ai/chat", { sessionId }),
  /** POST /api/ai/diagnose — leaf-photo disease detection. `image` is a data URL. */
  diagnose: (payload: { image: string; crop?: string; description?: string; language?: string }) =>
    post<DiagnoseResponse>("/ai/diagnose", payload),
  /** POST /api/ai/advisor — ranked crop suggestions for a Pakistani farm. */
  advisor: (payload: {
    province: string
    landSize?: number
    soilType?: string
    season?: string
    budget?: number
  }) => post<Record<string, any>>("/ai/advisor", payload),
}
