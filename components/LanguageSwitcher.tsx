"use client"

/**
 * AgriPak language switcher — all five languages, each written in its own script.
 *
 *   <LanguageSwitcher />                    // compact globe button, for a header
 *   <LanguageSwitcher variant="list" />     // full list, for a menu sheet or settings page
 *   <LanguageSwitcher variant="compact" showLabel />
 *
 * Switching writes through `useLanguage().setLanguage`, which persists the choice
 * and flips `<html lang>` / `<html dir>` — so the whole app re-mirrors itself.
 */

import { Check, Globe } from "lucide-react"
import { useLanguage } from "@/lib/contexts"
import type { LanguageCode } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface LanguageSwitcherProps {
  /** `"compact"` = dropdown button (default). `"list"` = always-open list of options. */
  variant?: "compact" | "list"
  /** Show the active language name next to the globe. Ignored by `"list"`. */
  showLabel?: boolean
  /** Called after a language is chosen — handy for closing the sheet that contains it. */
  onSelected?: (language: LanguageCode) => void
  className?: string
}

/**
 * Latin text must not be rendered in Nastaliq and vice-versa, so each option
 * carries its own font class rather than inheriting the page's.
 */
function scriptClass(code: LanguageCode): string {
  if (code === "en") return "font-latin"
  if (code === "ur" || code === "pa") return "font-nastaliq"
  return "font-naskh"
}

export function LanguageSwitcher({
  variant = "compact",
  showLabel = false,
  onSelected,
  className,
}: LanguageSwitcherProps) {
  const { t, currentLanguage, setLanguage, languages, dir } = useLanguage()

  const choose = async (code: LanguageCode) => {
    if (code !== currentLanguage) await setLanguage(code)
    onSelected?.(code)
  }

  if (variant === "list") {
    return (
      <div className={cn("grid gap-2", className)} role="group" aria-label={t("nav.chooseLanguage")}>
        {languages.map((language) => {
          const active = language.code === currentLanguage
          return (
            <button
              key={language.code}
              type="button"
              lang={language.code}
              dir={language.dir}
              onClick={() => choose(language.code)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex min-h-tap items-center justify-between gap-3 rounded-lg border px-4 py-2 text-start transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              <span className={cn("text-lg leading-[1.9]", scriptClass(language.code))}>{language.nativeName}</span>
              {active ? <Check className="h-5 w-5 shrink-0" aria-hidden /> : null}
            </button>
          )
        })}
      </div>
    )
  }

  const active = languages.find((language) => language.code === currentLanguage)

  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={showLabel ? "default" : "icon"}
          className={cn("min-h-tap min-w-tap gap-2", className)}
          aria-label={t("nav.chooseLanguage")}
        >
          <Globe className="h-5 w-5" aria-hidden />
          {showLabel && active ? (
            <span className={cn("text-sm leading-[1.9]", scriptClass(active.code))}>{active.nativeName}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel>{t("nav.chooseLanguage")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            lang={language.code}
            dir={language.dir}
            onSelect={() => choose(language.code)}
            className="min-h-tap cursor-pointer justify-between gap-3"
          >
            <span className={cn("text-base leading-[1.9]", scriptClass(language.code))}>{language.nativeName}</span>
            {language.code === currentLanguage ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LanguageSwitcher
