'use client'

import { useEffect, useState } from 'react'
import { NavBar } from '@/components/ui/navbar'
import { Footer } from '@/components/ui/footer'
import { auth } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

export default function NeoCardPage() {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/api/v1/prepaid/plans`)
        const data = await res.json()
        setPlans(Array.isArray(data) ? data : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleBuy = async (planId: string) => {
    const { data: { session } } = await auth.getSession()
    const token = session?.access_token
    if (!token) {
      alert('Please login to buy a Neo Card')
      return
    }

    const res = await apiFetch(`/api/v1/prepaid/purchase?plan_id=${planId}`, { method: 'POST' })
    if (res.ok) {
      alert('Neo Card requested! Pay at the counter and our staff will activate it for you.')
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.detail || 'Failed to purchase Neo Card')
    }
  }

  return (
    <div className="min-h-screen bg-cp-black text-white flex flex-col">
      <NavBar />
      <main className="flex-1 pt-24 px-6 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-cp-yellow mb-2">Buy Neo Card</h1>
        <p className="text-gray-300 mb-6">
          Choose a prepaid Neo Card to recharge your gaming hours.
        </p>

        {loading ? (
          <p className="text-gray-400">Loading plans...</p>
        ) : plans.length === 0 ? (
          <p className="text-gray-400">No Neo Card plans available right now.</p>
        ) : (
          <div className="space-y-3">
            {plans.map((plan: any) => (
              <div
                key={plan.id}
                className="flex items-center justify-between bg-cp-gray/20 border border-cp-cyan/30 rounded-lg p-4 text-sm"
              >
                <div>
                  <div className="font-semibold text-cp-cyan">{plan.name}</div>
                  <div className="text-gray-300">
                    ₹{plan.price} • {plan.minutes} minutes
                  </div>
                </div>
                <button
                  className="bg-cp-cyan text-cp-black px-4 py-2 rounded hover:bg-cp-yellow"
                  onClick={() => handleBuy(plan.id)}
                >
                  Buy
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}





