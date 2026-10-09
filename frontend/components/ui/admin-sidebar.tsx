'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  BarChart3, CalendarDays, CreditCard, FileText, Gamepad2, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Receipt, Settings, Star,
  Ticket, Trophy, Users, type LucideIcon,
} from 'lucide-react'
import { NavBar } from './navbar'
import { admin, auth } from '@/lib/supabase'

interface NavItem { label: string; href: string; icon: LucideIcon }

// Grouped by what staff are doing, instead of one flat row of twelve links.
export const ADMIN_NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays },
      { label: 'Stations', href: '/admin/stations', icon: Gamepad2 },
      { label: 'Receipts', href: '/admin/receipts', icon: Receipt },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Coupons', href: '/admin/coupons', icon: Ticket },
      { label: 'Points', href: '/admin/points', icon: Star },
      { label: 'Neo Cards', href: '/admin/settings#prepaid-plans', icon: CreditCard },
      { label: 'Tournaments', href: '/admin/tournaments', icon: Trophy },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
      { label: 'Reports', href: '/admin/reports', icon: FileText },
    ],
  },
  { label: 'System', items: [{ label: 'Settings', href: '/admin/settings', icon: Settings }] },
]

/** A link is current when the path matches its page. Links that point at a section of another page (#hash) are never "current". */
export function isActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname || href.includes('#')) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}

const STORAGE_KEY = 'adminSidebar'
const DESKTOP_QUERY = '(min-width: 1024px)'

/** Remembered choice ('open' | 'closed'); null when nothing is stored or storage is unavailable (private mode etc.). */
export function readStoredState(): 'open' | 'closed' | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'open' || v === 'closed' ? v : null
  } catch {
    return null
  }
}

function useSidebar() {
  const [desktop, setDesktop] = useState(true)
  const [open, setOpen] = useState(true)

  // first paint: restore the saved choice, otherwise open on desktop and closed on phones
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    setDesktop(mq.matches)
    setOpen((readStoredState() ?? (mq.matches ? 'open' : 'closed')) === 'open')
    const onChange = (e: MediaQueryListEvent) => {
      setDesktop(e.matches)
      if (!e.matches) setOpen(false) // a drawer left open when shrinking would cover the page
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const set = useCallback((next: boolean) => {
    setOpen(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed')
    } catch {
      /* the choice just will not be remembered */
    }
  }, [])

  return { desktop, open, set }
}

/**
 * The admin frame shared by every /admin page: site header, a collapsible left menu and the page itself.
 * The menu is only shown to admins (the pages still enforce access on their own).
 * `currentPath` / `skipAccessCheck` exist for previews and tests.
 */
export function AdminShell({ children, currentPath, skipAccessCheck = false }: { children: ReactNode; currentPath?: string; skipAccessCheck?: boolean }) {
  const livePath = usePathname()
  const pathname = currentPath ?? livePath
  const { desktop, open, set } = useSidebar()
  const [isAdmin, setIsAdmin] = useState(skipAccessCheck)

  useEffect(() => {
    if (skipAccessCheck) return
    let cancelled = false
    const check = async () => {
      try {
        const { data } = await admin.checkAccess()
        if (!cancelled) setIsAdmin(Boolean(data))
      } catch {
        if (!cancelled) setIsAdmin(false)
      }
    }
    check()
    const { data: { subscription } } = auth.onAuthChange(() => check())
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [skipAccessCheck])

  // on phones the menu is a drawer: close it after choosing a page, and on Escape
  useEffect(() => {
    if (!desktop) set(false)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (desktop || !open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop, open, set])

  const showMenu = isAdmin
  const pushContent = showMenu && open && desktop

  return (
    <div className="min-h-screen bg-cp-black">
      <NavBar />

      {showMenu && (
        <>
          {/* phone drawer backdrop */}
          {open && !desktop && <button type="button" aria-label="Close menu" className="fixed inset-0 top-20 z-30 bg-black/60" onClick={() => set(false)} />}

          <aside
            id="admin-sidebar"
            aria-label="Admin navigation"
            aria-hidden={!open}
            className={`fixed bottom-0 left-0 top-20 z-40 flex w-64 flex-col overflow-y-auto border-r border-cp-cyan/20 bg-cp-gray shadow-2xl transition-[transform,visibility] duration-200 ${
              open ? 'visible translate-x-0' : 'invisible -translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <span className="rounded border border-cp-magenta/50 bg-cp-magenta/15 px-2 py-1 text-[11px] font-bold tracking-[0.2em] text-purple-200">ADMIN</span>
              <button
                type="button"
                onClick={() => set(false)}
                title="Hide menu"
                aria-label="Hide menu"
                className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cp-cyan"
              >
                <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 px-3 pb-6">
              {ADMIN_NAV_GROUPS.map((group) => (
                <div key={group.label} className="mt-4" role="group" aria-label={group.label}>
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-gray-500">{group.label}</p>
                  <ul className="space-y-0.5">
                    {group.items.map(({ label, href, icon: Icon }) => {
                      const active = isActive(pathname, href)
                      return (
                        <li key={href}>
                          <Link
                            href={href}
                            aria-current={active ? 'page' : undefined}
                            className={`group flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cp-cyan ${
                              active
                                ? 'border-cp-cyan bg-cp-cyan/10 text-cp-cyan'
                                : 'border-transparent text-gray-300 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-cp-cyan' : 'text-gray-500 group-hover:text-cp-yellow'}`} aria-hidden="true" />
                            {label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          {/* when hidden, a small tab keeps the menu one click away */}
          {!open && (
            <button
              type="button"
              onClick={() => set(true)}
              title="Show menu"
              aria-label="Show menu"
              aria-controls="admin-sidebar"
              aria-expanded={false}
              className="fixed left-0 top-24 z-40 flex items-center gap-2 rounded-r-lg border border-l-0 border-cp-cyan/40 bg-cp-gray px-3 py-2 text-sm font-semibold text-cp-cyan shadow-lg transition-colors hover:bg-cp-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cp-cyan"
            >
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Menu</span>
            </button>
          )}
        </>
      )}

      <div className={`pt-20 transition-[padding] duration-200 ${pushContent ? 'lg:pl-64' : ''}`}>{children}</div>
    </div>
  )
}
