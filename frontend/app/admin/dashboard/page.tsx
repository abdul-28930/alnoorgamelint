'use client'

import { useState, useEffect } from 'react'
import { AdminGuard } from '@/components/ui/admin-guard'
import { InfoCard } from '@/components/ui/info-card'
import { bookings, auth, stations } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'


export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalBookings: 0,
    todayBookings: 0,
    totalRevenue: 0,
    activeStations: 0
  })
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    loadStats()
  }, [startDate, endDate])

  const loadStats = async () => {
    try {
      let url = `/api/v1/admin/stats/summary`
      
      // Add date range parameters if provided
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)
      if (params.toString()) url += `?${params.toString()}`
      
      const { data: { session } } = await auth.getSession()
      const token = session?.access_token
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      // Get active stations count
      const stationsResponse = await apiFetch(`/api/v1/stations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const stationsData = await stationsResponse.json()
      
      setStats({
        totalBookings: data.total_bookings || 0,
        todayBookings: data.today_bookings || 0,
        totalRevenue: data.total_revenue || 0,
        activeStations: stationsData?.length || 10
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const dashboardStats = [
    {
      title: "Total Bookings",
      description: startDate && endDate ? `${startDate} to ${endDate}` : startDate ? `From ${startDate}` : endDate ? `Until ${endDate}` : "All time bookings",
      value: stats.totalBookings.toString()
    },
    {
      title: "Today's Bookings", 
      description: "Bookings for today",
      value: stats.todayBookings.toString()
    },
    {
      title: "Total Revenue",
      description: startDate && endDate ? `${startDate} to ${endDate}` : startDate ? `From ${startDate}` : endDate ? `Until ${endDate}` : "All time revenue",
      value: `₹${stats.totalRevenue.toLocaleString()}`
    },
    {
      title: "Active Stations",
      description: "Available gaming stations", 
      value: stats.activeStations.toString()
    }
  ]

  return (
    <AdminGuard>
      <div className="min-h-screen bg-cp-black">
        
        
        <main className="pt-6 pb-12 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-cp-yellow">
                Admin <span className="text-cp-cyan">Dashboard</span>
              </h1>
              <p className="text-gray-300 mt-2">Gaming center overview and statistics</p>
            </div>

            <div className="mb-6 flex gap-4 items-end">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-gray-900 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none text-white [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-gray-900 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none text-white [color-scheme:dark]"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate('') }}
                  className="px-4 py-2 bg-cp-gray/20 border border-cp-cyan/30 rounded text-white hover:bg-cp-cyan/20"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {dashboardStats.map((stat, index) => (
                <div key={index} className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                  <h3 className="text-cp-yellow font-bold text-lg mb-2">{stat.title}</h3>
                  <div className="text-3xl font-bold text-white mb-2">{stat.value}</div>
                  <p className="text-gray-400 text-sm">{stat.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 max-w-2xl mx-auto">
              <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                <h3 className="text-cp-yellow font-bold text-xl mb-4">Recent Activity</h3>
                <div className="space-y-2 text-gray-300">
                  <div className="text-sm">📅 {stats.todayBookings} bookings today</div>
                  <div className="text-sm">💰 ₹{stats.totalRevenue.toLocaleString()} total earned</div>
                  <div className="text-sm">🎮 {stats.activeStations} stations active</div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  )
} 