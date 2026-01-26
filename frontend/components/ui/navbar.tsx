'use client'

import { NeonButton } from './neon-button'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { auth } from '@/lib/supabase'

export function NavBar() {
  const [user, setUser] = useState<any>(null)
  
  const navLinks = [
    { name: 'Stations', href: '/stations' },
    { name: 'Tournaments', href: '/tournaments' },
    { name: 'Rewards', href: '/rewards' },
    { name: 'Bookings', href: '/bookings' },
    { name: 'Profile', href: '/profile' }
  ]

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await auth.getSession()
      setUser(data.session?.user || null)
    }
    
    checkAuth()
    
    const { data: { subscription } } = auth.onAuthChange((event, session) => {
      setUser(session?.user || null)
    })
    
    return () => subscription?.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await auth.signOut()
    setUser(null)
  }

  return (
    <nav className="fixed top-0 w-full h-20 bg-cp-black/85 backdrop-blur-md z-50 px-6">
      <div className="flex items-center justify-between h-full max-w-7xl mx-auto">
        {/* Logo */}
        <Link href="/" className="text-2xl font-bold text-cp-yellow">
          NEO<span className="text-cp-cyan">GAMING</span><span className="text-cp-yellow">CAFE</span>
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center space-x-8 ml-16">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-white hover:text-cp-yellow transition-colors uppercase font-semibold"
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Auth/CTA Button */}
        <div className="flex items-center space-x-4">
          {user ? (
            <div className="flex items-center space-x-4">
              <span className="text-gray-300">Hi, {user.email}</span>
              <button
                onClick={handleLogout}
                className="text-cp-cyan hover:text-cp-yellow transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
        <Link href="/book">
          <NeonButton variant="primary">
            Book Now
          </NeonButton>
        </Link>
          )}
        </div>
      </div>
    </nav>
  )
} 