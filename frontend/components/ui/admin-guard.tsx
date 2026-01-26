'use client'

import { useState, useEffect } from 'react'
import { admin } from '@/lib/supabase'
import { NavBar } from './navbar'

interface AdminGuardProps {
  children: React.ReactNode
}

export function AdminGuard({ children }: AdminGuardProps) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAdminAccess()
  }, [])

  const checkAdminAccess = async () => {
    try {
      const { data } = await admin.checkAccess()
      setIsAdmin(data || false)
    } catch (error) {
      console.error('Error checking admin access:', error)
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cp-black">
        <NavBar />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-cp-cyan text-lg">Checking access...</div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-cp-black">
        <NavBar />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-cp-yellow mb-4">Access Denied</h1>
            <p className="text-gray-300 mb-6">You don't have admin access</p>
            <button 
              onClick={() => window.location.href = '/'}
              className="bg-cp-cyan text-cp-black px-6 py-3 rounded-lg hover:bg-cp-yellow"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
} 