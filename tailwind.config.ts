import type { Config } from "tailwindcss"

/**
 * AgriPak Tailwind theme (v3.4).
 *
 * Every colour is an HSL custom property defined in app/globals.css, so light and
 * dark mode both work without touching this file. Use the semantic names
 * (`bg-primary`, `text-muted-foreground`, `bg-brand-accent`, `text-gold`) — never
 * a raw hex — so shadcn/ui primitives and custom UI stay in sync.
 *
 * Mobile-first: the `xs` breakpoint is 360px, the smallest phone we support.
 * Use `min-h-tap` / `min-w-tap` (44px) for anything tappable.
 *
 * RTL: Tailwind's logical utilities (ms-*, me-*, ps-*, pe-*, start-*, end-*) and the
 * `rtl:` / `ltr:` variants work out of the box because LanguageContext sets
 * <html dir>. Extra helpers live in the @layer utilities block of globals.css.
 */

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        /** Smallest supported phone. Design at this width first. */
        xs: "360px",
      },

      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        /* ---- AgriPak brand ------------------------------------------- */
        /** Pakistan flag green #01411C. Same as `primary`, named for clarity. */
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          /** Lighter flag green #046A38 — hovers, links, active nav. */
          accent: "hsl(var(--brand-accent))",
          "accent-foreground": "hsl(var(--brand-accent-foreground))",
        },
        /** #D4AF37 — highlights, premium badges, section rules. */
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
          surface: "hsl(var(--gold-surface))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        /** Market movement. `text-price-up` / `text-price-down` also exist as utilities. */
        price: {
          up: "hsl(var(--price-up))",
          down: "hsl(var(--price-down))",
        },

        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      fontFamily: {
        /** Latin default (Inter, loaded via next/font in app/layout.tsx). */
        sans: ["var(--font-latin)"],
        /** Urdu / Punjabi Shahmukhi — Noto Nastaliq Urdu. */
        urdu: ["var(--font-nastaliq)"],
        nastaliq: ["var(--font-nastaliq)"],
        /** Sindhi / Pashto — Noto Naskh Arabic (covers ڏ ٺ ږ ښ ڻ). */
        naskh: ["var(--font-naskh)"],
      },

      fontSize: {
        /** Smallest size allowed on screen — anything below is unreadable outdoors. */
        "body-sm": ["0.9375rem", { lineHeight: "1.5" }],
      },

      spacing: {
        /** Minimum touch target (WCAG 2.5.5). */
        tap: "44px",
        header: "var(--header-height)",
        "bottom-nav": "var(--bottom-nav-height)",
      },

      minHeight: {
        tap: "var(--tap-target)",
      },
      minWidth: {
        tap: "var(--tap-target)",
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      boxShadow: {
        /** Soft green-tinted elevation — matches the brand better than neutral grey. */
        card: "0 1px 2px hsl(var(--brand) / 0.06), 0 4px 12px hsl(var(--brand) / 0.08)",
        "card-lg": "0 8px 28px hsl(var(--brand) / 0.14)",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
