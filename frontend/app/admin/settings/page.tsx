'use client'

import { useState, useEffect } from 'react'
import { NavBar } from '@/components/ui/navbar'
import { AdminGuard } from '@/components/ui/admin-guard'
import { AdminNavBar } from '@/components/ui/admin-navbar'
import { admin, auth } from '@/lib/supabase'

export default function AdminSettings() {
  const [adminEmails, setAdminEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prepaidPlans, setPrepaidPlans] = useState<any[]>([])
  const [newPlan, setNewPlan] = useState({ name: '', price: 0, minutes: 0 })

  useEffect(() => {
    loadAdminEmails()
    loadPrepaidPlans()
  }, [])

  const loadAdminEmails = async () => {
    setLoading(true)
    try {
      const { data } = await admin.getAdminEmails()
      setAdminEmails(data || [])
    } catch (error) {
      console.error('Error loading admin emails:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPrepaidPlans = async () => {
    try {
      const { data: { session } } = await auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/prepaid/plans`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      const data = await res.json()
      setPrepaidPlans(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error loading prepaid plans:', error)
      setPrepaidPlans([])
    }
  }

  const addEmail = async () => {
    if (!newEmail.trim() || adminEmails.includes(newEmail.trim())) return
    
    const updatedEmails = [...adminEmails, newEmail.trim()]
    await saveEmails(updatedEmails)
    setNewEmail('')
  }

  const removeEmail = async (email: string) => {
    const updatedEmails = adminEmails.filter(e => e !== email)
    await saveEmails(updatedEmails)
  }

  const saveEmails = async (emails: string[]) => {
    setSaving(true)
    try {
      await admin.updateAdminEmails(emails)
      setAdminEmails(emails)
    } catch (error) {
      console.error('Error saving admin emails:', error)
    } finally {
      setSaving(false)
    }
  }


  return (
    <AdminGuard>
      <div className="min-h-screen bg-cp-black">
        <NavBar />
        
        <div className="mt-20">
          <AdminNavBar />
        </div>
        
        <main className="pt-6 pb-12 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-cp-yellow">
                Admin <span className="text-cp-cyan">Settings</span>
              </h1>
              <p className="text-gray-300 mt-2">System settings and admin access management</p>
            </div>

            {/* Admin Email Management */}
            <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
              <h2 className="text-cp-yellow font-bold text-xl mb-4">Admin Email Access</h2>
              <p className="text-gray-300 mb-4">Only users with these emails can access the admin dashboard</p>
              
              {/* Add Email */}
              <div className="flex gap-2 mb-6">
                <input
                  type="email"
                  placeholder="Enter admin email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="flex-1 bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white"
                  onKeyPress={(e) => e.key === 'Enter' && addEmail()}
                />
                <button
                  onClick={addEmail}
                  disabled={saving || !newEmail.trim()}
                  className="bg-cp-cyan text-cp-black px-4 py-2 rounded hover:bg-cp-yellow disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {/* Email List */}
              <div className="space-y-2">
                {loading ? (
                  <div className="text-center text-cp-cyan">Loading...</div>
                ) : adminEmails.length === 0 ? (
                  <div className="text-center text-gray-400 py-4">No admin emails configured</div>
                ) : (
                  adminEmails.map((email) => (
                    <div key={email} className="flex items-center justify-between bg-cp-black/30 rounded p-3">
                      <span className="text-white">{email}</span>
                      <button
                        onClick={() => removeEmail(email)}
                        disabled={saving}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              {saving && (
                <div className="mt-4 text-center text-cp-cyan">Saving changes...</div>
              )}
            </div>

            {/* Prepaid Plans Management */}
            <div id="prepaid-plans" className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6 mt-6">
              <h2 className="text-cp-yellow font-bold text-xl mb-4">Prepaid Plans</h2>
              <p className="text-gray-300 mb-4">Configure prepaid card types available for users</p>

              <div className="flex gap-2 mb-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-300 mb-1">Plan Name</label>
                  <input
                    type="text"
                    placeholder="Plan name"
                    value={newPlan.name}
                    onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs text-gray-300 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    placeholder="Price"
                    value={newPlan.price}
                    onChange={(e) => setNewPlan({ ...newPlan, price: Number(e.target.value) || 0 })}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs text-gray-300 mb-1">Minutes</label>
                  <input
                    type="number"
                    placeholder="Minutes"
                    value={newPlan.minutes}
                    onChange={(e) => setNewPlan({ ...newPlan, minutes: Number(e.target.value) || 0 })}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!newPlan.name || !newPlan.price || !newPlan.minutes) return
                    const { data: { session } } = await auth.getSession()
                    const token = session?.access_token
                    if (!token) return

                    await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/prepaid/plans`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                      },
                      body: JSON.stringify(newPlan),
                    })
                    setNewPlan({ name: '', price: 0, minutes: 0 })
                    loadPrepaidPlans()
                  }}
                  className="bg-cp-cyan text-cp-black px-4 py-2 rounded hover:bg-cp-yellow self-end"
                >
                  Add
                </button>
              </div>

              <div className="space-y-2">
                {prepaidPlans.length === 0 ? (
                  <div className="text-gray-400 text-sm">No prepaid plans configured</div>
                ) : (
                  prepaidPlans.map((plan: any) => (
                    <div key={plan.id} className="flex items-center justify-between bg-cp-black/30 rounded p-3 text-sm">
                      <span className="text-white">
                        {plan.name} • ₹{plan.price} • {plan.minutes} min
                      </span>
                      <button
                        onClick={async () => {
                          await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/prepaid/plans/${plan.id}`, {
                            method: 'DELETE',
                          })
                          loadPrepaidPlans()
                        }}
                        className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </main>
      </div>
    </AdminGuard>
  )
} 