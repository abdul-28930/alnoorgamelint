# Gaming Centre Front-End

A neon-cyberpunk web app built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS** and **shadcn/ui**.

This UI consumes the FastAPI backend and follows the design system defined in [`/ui.md`](../ui.md).

## 🚀 Quick Start

```bash
# 1. Clone repo & move to frontend
cd frontend

# 2. Install deps
npm install  # or pnpm install

# 3. Copy environment variables
cp .env.example .env.local

# 4. Run dev server
npm run dev  # http://localhost:3000
```

### Required ENV
| Key                     | Example                                   |
| ----------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000/api/v1`            |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abc.supabase.co`             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon-key>`                     |

## 🗂️ Project Layout (App Router)
```
frontend/
├── app/
│   ├── layout.tsx          # root layout
│   ├── page.tsx            # landing page
│   ├── stations/page.tsx   # list & book stations
│   ├── bookings/page.tsx   # user dashboard
│   └── admin/              # admin routes (role-guarded)
├── components/
│   ├── ui/                 # shadcn primitives (auto-generated)
│   └── core/               # Neon* components (NavBar, HeroBanner …)
├── lib/
│   ├── supabase.ts         # `createBrowserClient`
│   └── api.ts              # tiny fetch wrapper to backend
├── styles/
│   └── globals.css         # Tailwind base + theme tokens
└── tailwind.config.ts
```

## 🎨 Design System Overview
The complete token & component spec lives in [`/ui.md`](../ui.md). Key highlights:

- **Font Family**: `Rajdhani`, fallbacks `Segoe UI`, `Roboto`, sans-serif
- **Primary Colors**: `--cp-yellow` (#FCEE0D), `--cp-cyan` (#00FFF7), `--cp-magenta` (#9413FF)
- **Neon Glow**: `--glow` → `0 0 8px var(--cp-yellow)`
- **Core Components**: `<NavBar>`, `<HeroBanner>`, `<NeonButton>`, `<InfoCard>`, `<Carousel>` … (see spec)

All shared styles are injected via Tailwind plugin utilities & CSS variables to ensure visual consistency across pages.

## 📦 Scripts
| Command          | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | Start dev server with hot reload          |
| `npm run build`  | Production build                          |
| `npm run lint`   | ESLint + TypeScript checks                |
| `npm run format` | Prettier format fix                       |
| `npm run test`   | Playwright E2E tests (optional)           |

## 🤝 Integration Notes
1. **Auth**: Supabase Auth (JWT) → pass token to backend via `fetch` headers.
2. **Timezone**: Convert UTC → IST client-side using `Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata'})`.
3. **Env Sync**: Ensure `NEXT_PUBLIC_API_BASE` matches the FastAPI base URL (Fly.io or local).

## 🛠️ Generating shadcn/ui Components
```bash
npx shadcn-ui@latest init      # one-time
npx shadcn-ui@latest add button card dialog ...
```
Modify generated components to apply neon theme tokens (see examples in `/components/ui`).

## 🧩 Required UI Components
Based on the design system in `ui.md`, the following components are considered **canonical** and must be implemented once and reused everywhere:

| # | Component | Purpose |
|---|-----------|---------|
| 1 | `<NavBar />` | Global navigation, language switch, sticky top |
| 2 | `<HeroBanner />` | Edge-to-edge hero with neon CTAs |
| 3 | `<NeonButton />` | Primary & secondary call-to-action buttons |
| 4 | `<SectionDivider />` | Angled separators between sections |
| 5 | `<InfoCard />` | Generic content card (stations, news, etc.) |
| 6 | `<Carousel />` | Horizontal scroll of `InfoCard` items |
| 7 | `<NewsTile />` | Compact news/media list items |
| 8 | `<NeonInput />` / `<NeonSelect />` | Form controls (profile, booking) |
| 9 | `<NeonIconButton />` | Circular icon button (e.g., close, play) |
| 10 | `<NeonGhostButton />` | Tertiary inline action link |
| 11 | `<ToggleSwitch />` | Settings toggles (dark-mode, etc.) |
| 12 | `<Tabs />` | Section switching in dashboards |
| 13 | `<Footer />` | Site footer with social / links |
| 14 | **Global Scrollbar** | Consistent neon scrollbar styling |

Implement these in `/components/core` (or `/components/ui` via shadcn override). **Do not** restyle on a per-page basis; all pages pull from the same component library to maintain a unified cyberpunk look.

## 🧪 Testing Checklist
- [ ] NavBar sticky & mobile drawer
- [ ] Booking flow happy path
- [ ] Admin dashboard table renders
- [ ] Lighthouse score ≥ 90 for a11y & perf

---
Happy hacking in Night City ✨ 