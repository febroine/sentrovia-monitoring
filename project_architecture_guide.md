# Uptime Monitoring Platform - Project Architecture & Documentation

This document provides a comprehensive technical overview, architectural snapshot, and UI/UX design guidelines for the Uptime Monitoring Platform. It is specifically designed to onboard other AI models and developers quickly, transferring codebase context and recent architectural decisions.

---

## 1. Project Overview & Scope
The Uptime Monitoring Platform is a modern, single-page-application-like dashboard designed for monitoring websites, servers, and APIs. It includes features for configuring notification channels, managing uptime alerts, reviewing detailed incident logs, monitoring HTTP status code distributions, and tracking system health.

Currently, the application operates mostly with **mock data and hardcoded arrays** on the frontend, preparing to be integrated with a live backend database/API layer using persistent storage (e.g., PostgreSQL/Supabase) and real-time backend queues.

---

## 2. Technology Stack & Tooling
The project is built on the bleeding edge of the JavaScript/React ecosystem:

- **Framework**: `Next.js 16.2` (Using App Router syntax, entirely Client-side components `"use client"` in major views)
- **Core Library**: `React 19.x` & `ReactDOM 19.x`
- **Language**: `TypeScript` (Strict mode adherence)
- **Styling Framework**: `Tailwind CSS v4` + PostCSS (Note: using functional `@theme` layers in PostCSS/Tailwind v4 paradigms)
- **UI Architecture**:
  - Primitives based on Radix UI (accessible).
  - Native `shadcn/ui` components integrated directly into `src/components/ui/`.
  - Stying utilities via `class-variance-authority`, `clsx`, `tailwind-merge`.
- **Icons**: `lucide-react`
- **Data Visualization**: `recharts` for charts (Uptime rings, Line charts, Status code distributions).
- **Date Formatting**: `date-fns` for timestamps and localizations.
- **Animations**: `tailwindcss-animate` & `tw-animate-css` for micro-interactions and transitions.

---

## 3. Directory Structure
```text
uptimemonitoring/
â”œâ”€â”€ package.json
â”œâ”€â”€ package-lock.json      # Dependency definitions
â”œâ”€â”€ tsconfig.json          # TS Strict settings
â”œâ”€â”€ next.config.ts         # Next.js configurations
â””â”€â”€ src/
    â”œâ”€â”€ app/               # Next.js App Router root
    â”‚   â”œâ”€â”€ globals.css    # Global CSS constraints, token variables, custom scrollbar
    â”‚   â”œâ”€â”€ layout.tsx     # Root layout wrapper (Sidebar + Content)
    â”‚   â”œâ”€â”€ page.tsx       # Main Dashboard (Overview, KPI metrics, Charts)
    â”‚   â”œâ”€â”€ monitoring/    # Monitoring rules & endpoints configurations
    â”‚   â”œâ”€â”€ status-codes/  # Distribution visualization of encountered HTTP codes
    â”‚   â”œâ”€â”€ companies/     # Client/tenant management module
    â”‚   â”œâ”€â”€ logs/          # Event & incident history viewer
    â”‚   â””â”€â”€ settings/      # User, notifications, and platform settings (slimmed down recently)
    â”œâ”€â”€ components/
    â”‚   â”œâ”€â”€ sidebar.tsx    # Main App Navigation
    â”‚   â””â”€â”€ ui/            # Reusable primitive UI components (Button, Select, Card, Badge, Input, etc.)
    â”œâ”€â”€ context/
    â”‚   â””â”€â”€ translation-context.tsx # i18n Context provider matching keys from locale dict
    â””â”€â”€ locales/
        â””â”€â”€ en.ts          # Root dictionary for all platform strings (Strict English only)
```

---

## 4. UI / UX & Design Guidelines
The platform is designed following the **Lumina Sentrovia** aestheticâ€”a sleek, modern, terminal/NOC-inspired dark mode environment with glassmorphic accents.

### Core Design Rules
1. **Dark Native Theme**: The platform uses precise aesthetic tokens defined in `globals.css` (e.g., `--color-background`, `--color-surface-highest`, `--color-border`). You should **never** hardcode colors like `bg-gray-800`; always use semantic tokens like `bg-surface-high`, `border-border`, `text-muted-foreground`.
2. **Smooth Micro-animations**: Components leverage `animate-in`, `fade-in`, and `zoom-in` classes heavily (via TailwindCSS Animate). Modals and Popovers should glide in smoothly, never snap abruptly.
3. **Typography**: Modern and legible, utilizing small tracking enhancements (`tracking-tight` for headers, `tracking-wider` on `uppercase` super-titles).
4. **Custom Scrollbars & Inputs**:
   - `globals.css` overrides webkit and firefox scrollbars to be exceptionally thin and minimalist (`scrollbar-width: thin`, `scrollbar-gutter: stable`).
   - Default browser number input spinners are strictly hidden via CSS rules. Do not force inline styles for spin buttons.
5. **No Layout Shifts**: Modals, dropdowns, and data fetching states should preserve space to dodge layout jitter.

---

## 5. Implementation Idioms & Known States

### A. Internalization (i18n) Engine
- **English-Only Approach**: Previously multi-language, but explicitly reverted to an English-only (`en`) monolith. The `TranslationProvider` is kept to keep translations isolated in `en.ts` for clean TSX files.
- **Convention**: Use `const { t } = useTranslation();`. Then call `t('common.searchPlaceholder')` or `t('settings.account.profileInfo')`. Do NOT hardcode strings into `page.tsx` elements directly. **All text must live in `src/locales/en.ts`.**
- **Fallback Rule**: The translator will parse nested objects. If a key isn't found, it defaults to returning the key name. Always ensure keys exist in `en.ts`.

### B. UI Component Caveats (Select Dropdowns)
- **Select Component Alignment**: The `SelectContent` from Radix UI primitive is modified to expand correctly when `<SelectItem>` labels are longer than the `<SelectTrigger>`. Radix's default behavior was shrinking text and throwing ellipses (`truncate`). To avoid this, `whitespace-nowrap` is stripped out and items natively wrap or expand within `SelectContent` bounded by layout flows.
- **Select Trigger Scaling**: When rendering Select elements side-by-side (like search inputs and filters), apply `w-full` logic correctly into `SelectTrigger` to avoid collapse errors.

### C. Removed Features (Do Not Resurrect Without Prompting)
- Features intentionally removed from the codebase recently to streamline the app include: `Timezone config`, `Check Locations node selection`, `SSL Certificate Monitoring configs`, `Available Integrations menu`, `Webhook Configuration module`, `API Keys generator`, `Two-Factor Authentication module`, `Data Import mechanisms`, and Turkish `tr.ts` dictionaries.

### D. Current Limitations / Roadmap for AI Assistance
1. **Mock Data Migration**: `page.tsx`, `logs/page.tsx`, `monitoring/page.tsx`, etc., strictly use `const mockData = [...]`. Transitioning these views to accept React Query or simple API Hooks using a Supabase/Postgres logic is the immediate next step.
2. **Routing & Loading Constraints**: Ensure Next.js metadata is placed appropriately. Due to extensive use of `"use client"`, true server-rendered SEO constraints must be kept in mind if public-facing subpages are added (e.g., Public Status Pages).

---

## Example Usage for AI Developer
If you are asked to "add a new chart for API response times", you must:
1. Locate `src/app/page.tsx` (Dashboard).
2. Use `Recharts` module.
3. Apply `bg-card` and `border-border` to the chart wrapper layer.
4. Add translation strings for titles/descriptions into `src/locales/en.ts` (e.g., `dashboard.charts.apiResponse`).
5. Use existing color tokens like `var(--color-up)`, `var(--color-destructive)` rather than generic tailwind red/green equivalents, ensuring visual branding consistency.
