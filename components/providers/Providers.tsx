"use client"

/**
 * Every client-side provider the app needs, in dependency order.
 *
 *   ThemeProvider   -> puts `.dark` on <html>, which globals.css keys off
 *   AuthProvider    -> `useAuth()`; must sit above LanguageProvider, which reads
 *                      the signed-in farmer's saved language preference
 *   LanguageProvider-> `useLanguage()`; owns <html lang> / <html dir>
 *
 * Mounted once by app/layout.tsx. Pages should never re-wrap these.
 */

import { ReactNode } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/contexts/AuthContext"
import { LanguageProvider } from "@/lib/contexts/LanguageContext"
import { Toaster } from "@/components/ui/sonner"

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <LanguageProvider>
          {children}
          {/* Top-center: the bottom of the screen belongs to the nav bar and the
              AI button. Sonner reads `dir` from <html>, so RTL is automatic. */}
          <Toaster position="top-center" closeButton richColors />
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default Providers
