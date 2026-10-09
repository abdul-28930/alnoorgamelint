'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart3, CalendarDays, CreditCard, FileText, Gamepad2, LayoutDashboard, Receipt, Settings, Star, Ticket, Trophy, Users,
  type LucideIcon,
} from 'lucide-react'

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

/** `currentPath` is only for previews and tests; in the app the real URL is used. */
export function AdminNavBar({ currentPath }: { currentPath?: string }) {
  const livePath = usePathname()
  const pathname = currentPath ?? livePath
  const scroller = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })

  const updateFade = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setFade({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }, [])

  // keep the current page's link in view on narrow screens
  useEffect(() => {
    const el = scroller.current
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]')
    // only when the row overflows (narrow screens); on wide screens everything is already visible
    if (el && current && el.scrollWidth > el.clientWidth + 4) {
      el.scrollTo({ left: current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2 })
    }
    updateFade()
  }, [pathname, updateFade])

  useEffect(() => {
    window.addEventListener('resize', updateFade)
    return () => window.removeEventListener('resize', updateFade)
  }, [updateFade])

  return (
    <nav aria-label="Admin navigation" className="w-full border-b border-cp-cyan/20 bg-gradient-to-b from-cp-gray to-cp-black">
      <div className="relative mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-6">
        <div
          ref={scroller}
          onScroll={updateFade}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="flex shrink-0 items-center gap-1" role="group" aria-label={group.label}>
              {groupIndex > 0 && <span className="mx-1.5 h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />}
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(pathname, href)
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cp-cyan ${
                      active
                        ? 'bg-cp-cyan/10 text-cp-cyan shadow-[inset_0_-2px_0_0_#00FFF7]'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-cp-cyan' : 'text-gray-500 group-hover:text-cp-yellow'}`} aria-hidden="true" />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>

        {/* edge fades hint that the row scrolls on small screens */}
        {fade.left && <div className="pointer-events-none absolute inset-y-0 left-4 w-8 bg-gradient-to-r from-cp-gray to-transparent sm:left-6" aria-hidden="true" />}
        {fade.right && <div className="pointer-events-none absolute inset-y-0 right-4 w-10 bg-gradient-to-l from-cp-black to-transparent sm:right-6" aria-hidden="true" />}
      </div>
    </nav>
  )
}
