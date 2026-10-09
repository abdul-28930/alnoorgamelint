'use client'

import { useState, useEffect } from 'react'
import { AdminGuard } from '@/components/ui/admin-guard'
import { apiFetch } from '@/lib/api'


export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newCode, setNewCode] = useState('')
  const [newDiscount, setNewDiscount] = useState('')
  const [newType, setNewType] = useState('CUSTOM')
  const [newExpires, setNewExpires] = useState('30')

  useEffect(() => {
    fetchCoupons()
  }, [])

  const fetchCoupons = async () => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).auth.getSession()
      const token = session?.access_token
      
      if (!token) {
        setCoupons([])
        return
      }
      
      const response = await apiFetch(`/api/v1/admin/all-coupons`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        setCoupons([])
        return
      }
      
      const data = await response.json()
      setCoupons(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch coupons:', error)
      setCoupons([])
    } finally {
      setLoading(false)
    }
  }

  const createCoupon = async () => {
    if (!newCode || !newDiscount) return alert('Fill all fields')
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).auth.getSession()
      const response = await apiFetch(`/api/v1/admin/create-coupon?code=${newCode}&discount_percentage=${newDiscount}&coupon_type=${newType}&expires_days=${newExpires}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })
      if (response.ok) {
        fetchCoupons()
        setNewCode('')
        setNewDiscount('')
      } else {
        alert('Failed to create coupon')
      }
    } catch (e) {
      alert('Error creating coupon')
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-black text-white">
        
        <main className="p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Coupon Management</h1>
            
            <div className="bg-gray-900 rounded-lg p-4 mb-6">
              <h2 className="text-xl font-bold mb-4 text-cp-yellow">Create Coupon</h2>
              <div className="flex gap-4 flex-wrap items-end">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Code</label>
                  <input value={newCode} onChange={(e) => setNewCode(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Discount %</label>
                  <input type="number" value={newDiscount} onChange={(e) => setNewDiscount(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white w-32" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Type</label>
                  <select value={newType} onChange={(e) => setNewType(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                    <option value="CUSTOM">CUSTOM</option>
                    <option value="FIRST_BOOKING">FIRST_BOOKING</option>
                    <option value="REFERRAL">REFERRAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Expires (days)</label>
                  <input type="number" value={newExpires} onChange={(e) => setNewExpires(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white w-32" />
                </div>
                <button onClick={createCoupon} className="bg-cp-cyan text-black px-4 py-2 rounded hover:bg-cp-yellow">Create</button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-8">Loading coupons...</div>
            ) : (
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left">Code</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Discount</th>
                      <th className="px-4 py-3 text-left">User</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((coupon: any) => (
                      <tr key={coupon.id} className="border-b border-gray-700">
                        <td className="px-4 py-3 font-mono text-cyan-400">{coupon.code}</td>
                        <td className="px-4 py-3">{coupon.type}</td>
                        <td className="px-4 py-3">{coupon.discount_percentage}%</td>
                        <td className="px-4 py-3">{coupon.user_profiles?.username || 'N/A'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs ${
                            coupon.used_by ? 'bg-red-600' : 'bg-green-600'
                          }`}>
                            {coupon.used_by ? 'Used' : 'Available'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {new Date(coupon.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </AdminGuard>
  )
} 