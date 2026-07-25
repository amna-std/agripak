"use client"

/**
 * AgriPak language provider.
 *
 * Supplies translation, direction (LTR/RTL), Pakistani number/currency formatting
 * and text-to-speech to the whole app.
 *
 *   const { t, dir, isRTL, formatCurrency, currentLanguage, setLanguage } = useLanguage()
 *
 *   <p>{t("weather.humidity")}</p>
 *   <p>{formatCurrency(3500)}</p>          // "Rs 3,500"
 *
 * Side effects on language change:
 *   - `localStorage["agripak.language"]` is updated
 *   - `<html lang>` and `<html dir>` are updated (CSS in globals.css keys off both)
 *   - the logged-in user's `preferences.language` is saved, if there is one
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { AuthContext } from "./AuthContext"
import {
  DEFAULT_LANGUAGE,
  formatCurrency as formatCurrencyBase,
  formatNumber as formatNumberBase,
  getDirection,
  getLocale,
  isRTL as isRtlCode,
  languageList,
  normalizeLanguage,
  translate,
  type CurrencyFormatOptions,
  type Direction,
  type LanguageCode,
  type LanguageMeta,
  type NumberFormatOptions,
  type TranslationKey,
  type TranslationVars,
} from "@/lib/i18n"

const STORAGE_KEY = "agripak.language"
const VOICE_STORAGE_KEY = "agripak.voiceEnabled"

export interface LanguageContextType {
  /** Active language code. */
  currentLanguage: LanguageCode
  /** Change language (persists to localStorage + user profile). */
  setLanguage: (language: LanguageCode) => Promise<void>
  /** Legacy alias of `setLanguage` — many existing pages call this. */
  changeLanguage: (language: LanguageCode) => Promise<void>
  /** Translate a dot-path key, e.g. `t("market.title")`. `{vars}` are interpolated. */
  t: (key: TranslationKey | (string & {}), vars?: TranslationVars) => string
  /** "rtl" for ur/pa/sd/ps, "ltr" for en. */
  dir: Direction
  /** Convenience boolean mirroring `dir === "rtl"`. */
  isRTL: boolean
  /** BCP-47 locale of the active language (ur-PK, pa-PK, sd-PK, ps-AF, en-PK). */
  locale: string
  /** Format PKR — `formatCurrency(3500)` -> "Rs 3,500". Never the Indian rupee sign. */
  formatCurrency: (amount: number | string | null | undefined, options?: CurrencyFormatOptions) => string
  /** Grouped Latin-digit number, e.g. 1234567 -> "1,234,567". */
  formatNumber: (value: number | string, options?: NumberFormatOptions) => string
  /** Whether text-to-speech is switched on. */
  voiceEnabled: boolean
  toggleVoice: () => Promise<void>
  /** Speak text in the active (or given) language. No-op when voice is off. */
  speak: (text: string, language?: LanguageCode) => void
  stopSpeaking: () => void
  /** All supported languages, for the language picker. */
  languages: LanguageMeta[]
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}

function readStoredLanguage(): LanguageCode | null {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? normalizeLanguage(stored) : null
  } catch {
    return null
  }
}

/**
 * `speechSynthesis.getVoices()` returns [] until the engine has loaded its voice
 * list, which on Chrome/Android happens asynchronously. Without this warm-up the
 * very first tap on "read aloud" finds no voice and the browser reads Urdu text
 * with an English voice. Calling getVoices() once kicks the load off; the
 * `voiceschanged` listener keeps the cache fresh when voices are added later.
 */
function warmUpVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {}
  const refresh = () => {
    window.speechSynthesis.getVoices()
  }
  refresh()
  window.speechSynthesis.addEventListener?.("voiceschanged", refresh)
  return () => window.speechSynthesis.removeEventListener?.("voiceschanged", refresh)
}

/** Keeps `<html lang>` / `<html dir>` in sync so CSS logical properties work. */
function applyDocumentLanguage(code: LanguageCode) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.lang = code
  root.dir = getDirection(code)
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const authContext = useContext(AuthContext)

  // Always start at the SSR default so the first client render matches the server;
  // the stored preference is applied in the effect below.
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = readStoredLanguage()
    if (stored) setCurrentLanguage(stored)
    applyDocumentLanguage(stored ?? DEFAULT_LANGUAGE)

    try {
      const storedVoice = window.localStorage.getItem(VOICE_STORAGE_KEY)
      if (storedVoice !== null) setVoiceEnabled(storedVoice === "true")
    } catch {
      /* localStorage can be blocked — voice just stays on */
    }

    setHydrated(true)

    return warmUpVoices()
  }, [])

  // A logged-in profile preference wins only when the device has no explicit choice.
  useEffect(() => {
    if (!hydrated) return
    if (readStoredLanguage()) return

    const preferred = authContext?.user?.preferences?.language
    if (preferred) {
      const code = normalizeLanguage(preferred)
      setCurrentLanguage(code)
      applyDocumentLanguage(code)
    }
    if (typeof authContext?.user?.preferences?.voiceEnabled === "boolean") {
      setVoiceEnabled(authContext.user.preferences.voiceEnabled)
    }
  }, [hydrated, authContext?.user])

  const setLanguage = useCallback(
    async (language: LanguageCode) => {
      const code = normalizeLanguage(language)
      setCurrentLanguage(code)
      applyDocumentLanguage(code)

      try {
        window.localStorage.setItem(STORAGE_KEY, code)
      } catch {
        /* ignore — private mode / storage disabled */
      }

      try {
        if (authContext?.user && authContext?.updateProfile) {
          await authContext.updateProfile({
            preferences: {
              voiceEnabled,
              ...authContext.user.preferences,
              language: code,
            },
          })
        }
      } catch (error) {
        console.error("Failed to save language preference:", error)
      }
    },
    // `voiceEnabled` is read inside — without it a stale value can be written back
    // to the profile when the user toggles voice and then switches language.
    [authContext, voiceEnabled],
  )

  const toggleVoice = useCallback(async () => {
    const next = !voiceEnabled
    setVoiceEnabled(next)

    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, String(next))
    } catch {
      /* ignore */
    }

    try {
      if (authContext?.user && authContext?.updateProfile) {
        await authContext.updateProfile({
          preferences: {
            language: currentLanguage,
            ...authContext.user.preferences,
            voiceEnabled: next,
          },
        })
      }
    } catch (error) {
      console.error("Failed to save voice preference:", error)
    }
  }, [voiceEnabled, currentLanguage, authContext])

  const speak = useCallback(
    (text: string, language: LanguageCode = currentLanguage) => {
      if (!voiceEnabled || !text) return
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return

      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      // ur-PK / pa-PK / sd-PK / ps-AF / en-PK — never the Indian hi-IN or te-IN.
      utterance.lang = getLocale(language)
      utterance.rate = 0.9
      utterance.pitch = 1

      // Pick a matching installed voice when one exists; otherwise fall back to any
      // Urdu/Arabic-script voice, which is far more intelligible than a Latin one.
      const voices = window.speechSynthesis.getVoices()
      const exact = voices.find((v) => v.lang.toLowerCase() === utterance.lang.toLowerCase())
      const sameLanguage = voices.find((v) => v.lang.toLowerCase().startsWith(language.toLowerCase()))
      const urduFallback = language !== "en" ? voices.find((v) => v.lang.toLowerCase().startsWith("ur")) : undefined
      const voice = exact ?? sameLanguage ?? urduFallback
      if (voice) utterance.voice = voice

      window.speechSynthesis.speak(utterance)
    },
    [currentLanguage, voiceEnabled],
  )

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
  }, [])

  const value = useMemo<LanguageContextType>(() => {
    const t = (key: TranslationKey | (string & {}), vars?: TranslationVars) => translate(key, currentLanguage, vars)

    return {
      currentLanguage,
      setLanguage,
      changeLanguage: setLanguage,
      t,
      dir: getDirection(currentLanguage),
      isRTL: isRtlCode(currentLanguage),
      locale: getLocale(currentLanguage),
      formatCurrency: (amount, options) => formatCurrencyBase(amount, { lang: currentLanguage, ...options }),
      formatNumber: (value, options) => formatNumberBase(value, options),
      voiceEnabled,
      toggleVoice,
      speak,
      stopSpeaking,
      languages: languageList,
    }
  }, [currentLanguage, setLanguage, voiceEnabled, toggleVoice, speak, stopSpeaking])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export default LanguageProvider
