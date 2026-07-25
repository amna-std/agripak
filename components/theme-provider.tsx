"use client"

/**
 * next-themes wrapper plus the light/dark toggle used in the app header.
 *
 * The theme class lands on `<html>`, which is where globals.css defines its
 * `.dark` token block — nothing else in the app needs to know about themes.
 */

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme, type ThemeProviderProps } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

import { useLanguage } from "@/lib/contexts"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

export interface ThemeToggleProps {
  className?: string
}

/**
 * Light / dark / follow-system.
 *
 * The icon can only be decided on the client, so until mount it renders a
 * neutral placeholder of the same size — that keeps the header from shifting
 * and avoids a hydration mismatch.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { t, dir } = useLanguage()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const options = [
    { value: "light", label: t("nav.lightMode"), icon: Sun },
    { value: "dark", label: t("nav.darkMode"), icon: Moon },
    { value: "system", label: t("nav.systemMode"), icon: Monitor },
  ] as const

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("min-h-tap min-w-tap", className)}
        aria-label={t("nav.theme")}
        disabled
      >
        <Sun className="h-5 w-5 opacity-0" aria-hidden />
      </Button>
    )
  }

  const Icon = resolvedTheme === "dark" ? Moon : Sun

  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("min-h-tap min-w-tap", className)} aria-label={t("nav.theme")}>
          <Icon className="h-5 w-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => setTheme(option.value)}
            className={cn("min-h-tap cursor-pointer gap-3", theme === option.value && "bg-accent text-accent-foreground")}
          >
            <option.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
