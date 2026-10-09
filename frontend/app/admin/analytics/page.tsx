'use client'

import { useState, useEffect } from 'react'
import { AdminGuard } from '@/components/ui/admin-guard'
import { BookingCalendar } from '@/components/ui/booking-calendar'
import { DateBookingsModal } from '@/components/ui/date-bookings-modal'
import { bookings } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'


export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState({
    totalRevenue: 0,
    totalBookings: 0,
    avgBookingValue: 0,
    pcBookings: 0,
    ps5Bookings: 0,
    bookingActivityStats: [] as any[],
    stationUsageStats: [] as any[],
    recentBookings: [] as any[]
  })
  const [loading, setLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState<'today' | '1day' | '7days' | '30days' | 'custom'>('30days')
  const [showCalendar, setShowCalendar] = useState(false)
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [stats, setStats] = useState({
    totalBookings: 0,
    paidBookings: 0,
    totalRevenue: 0,
    occupancyRate: 0
  })
  const [paymentStats, setPaymentStats] = useState({
    total_advance_collected: 0,
    total_remaining: 0,
    advance_bookings_count: 0,
    total_bookings: 0
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dateBookings, setDateBookings] = useState<any>({})
  const [bookingDates, setBookingDates] = useState<string[]>([])
  const [showBookingsModal, setShowBookingsModal] = useState(false)

  useEffect(() => {
    loadAnalytics()
    loadBookingDates()
  }, [dateFilter, customRange])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await apiFetch(`/api/v1/admin/stats/summary`)
        const data = await response.json()
        setStats(data)
        
        const paymentResponse = await apiFetch(`/api/v1/admin/stats/payments`)
        const paymentData = await paymentResponse.json()
        setPaymentStats(paymentData)
      } catch (error) {
        console.error('Error fetching stats:', error)
      }
    }
    fetchStats()
  }, [])

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const { data: allBookings } = await bookings.getAllBookings()
      
      if (!allBookings) return
      
      // Filter bookings based on date selection
      const filteredBookings = filterBookingsByDate(allBookings)
      
      // Basic calculations
      const totalRevenue = filteredBookings.reduce((sum, booking) => sum + (booking.total_amount || 0), 0)
      const totalBookings = filteredBookings.length
      const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0
      
      // Station type breakdown
      const pcBookings = filteredBookings.filter(b => b.stations?.type === 'PC').length
      const ps5Bookings = filteredBookings.filter(b => b.stations?.type === 'PS5').length
      
      // Daily stats 
      const bookingActivityStats = getBookingActivityStats(filteredBookings)
      const stationUsageStats = getStationUsageStats(filteredBookings)
      
      // Recent bookings (last 5)
      const recentBookings = filteredBookings
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
      
      setAnalytics({
        totalRevenue,
        totalBookings,
        avgBookingValue,
        pcBookings,
        ps5Bookings,
        bookingActivityStats,
        stationUsageStats,
        recentBookings
      })
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterBookingsByDate = (bookings: any[]) => {
    const now = new Date()
    
    switch (dateFilter) {
      case 'today':
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        return bookings.filter(booking => {
          const bookingDate = new Date(booking.start_at)
          return bookingDate >= today && bookingDate < tomorrow
        })
      
      case '1day':
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        yesterday.setHours(0, 0, 0, 0)
        const yesterdayEnd = new Date(yesterday)
        yesterdayEnd.setHours(23, 59, 59, 999)
        return bookings.filter(booking => {
          const bookingDate = new Date(booking.start_at)
          return bookingDate >= yesterday && bookingDate <= yesterdayEnd
        })
      
      case '7days':
        const week = new Date()
        week.setDate(week.getDate() - 7)
        week.setHours(0, 0, 0, 0)
        return bookings.filter(booking => {
          const bookingDate = new Date(booking.start_at)
          return bookingDate >= week
        })
      
      case '30days':
        const month = new Date()
        month.setDate(month.getDate() - 30)
        month.setHours(0, 0, 0, 0)
        return bookings.filter(booking => {
          const bookingDate = new Date(booking.start_at)
          return bookingDate >= month
        })
      
      case 'custom':
        if (!customRange.start || !customRange.end) return bookings
        const start = new Date(customRange.start)
        const end = new Date(customRange.end)
        end.setHours(23, 59, 59, 999)
        return bookings.filter(booking => {
          const bookingDate = new Date(booking.start_at)
          return bookingDate >= start && bookingDate <= end
        })
      
      default:
        return bookings
    }
  }

  const getDateRange = () => {
    if (dateFilter === 'custom' && customRange.start && customRange.end) {
      const start = new Date(customRange.start)
      const end = new Date(customRange.end)
      const dates = []
      const current = new Date(start)
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
      }
      return dates
    }
    
    const days = dateFilter === 'today' ? 1 : dateFilter === '1day' ? 1 : dateFilter === '30days' ? 30 : 7
    return Array.from({ length: days }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - i)
      return date.toISOString().split('T')[0]
    }).reverse()
  }

  const getBookingActivityStats = (bookings: any[]) => {
    const dateRange = getDateRange()
    
    return dateRange.map(dateStr => {
      const dayBookings = bookings.filter(booking => {
        if (!booking.created_at) return false
        return new Date(booking.created_at).toISOString().split('T')[0] === dateStr
      })
      
      return {
        date: new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        bookings: dayBookings.length,
        revenue: dayBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
      }
    })
  }

  const getStationUsageStats = (bookings: any[]) => {
    const dateRange = getDateRange()
    
    return dateRange.map(dateStr => {
      const dayBookings = bookings.filter(booking => {
        if (!booking.start_at) return false
        return new Date(booking.start_at).toISOString().split('T')[0] === dateStr
      })
      
      return {
        date: new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        bookings: dayBookings.length,
        revenue: dayBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
      }
    })
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString()}`
  }

  const loadBookingDates = async () => {
    try {
      const { data: allBookings } = await bookings.getAllBookings()
      const dates = Array.from(new Set<string>(
        (allBookings ?? []).map((booking: { start_at: string }) => booking.start_at.split('T')[0])
      ))
      setBookingDates(dates)
    } catch (error) {
      console.error('Error loading booking dates:', error)
    }
  }

  const loadDateBookings = async (date: string) => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).auth.getSession()
      const token = session?.access_token
      
      if (!token) return
      
      const response = await apiFetch(`/api/v1/admin/bookings/by-date?date=${date}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setDateBookings(data)
      }
    } catch (error) {
      console.error('Error loading date bookings:', error)
    }
  }

  const handleDateSelect = async (date: string) => {
    setSelectedDate(date)
    await loadDateBookings(date)
    setShowBookingsModal(true)
  }

  const DailyBookingsChart = ({ data, maxValue }: any) => {
    const needsScroll = data.length > 7
    
    return (
      <div className={`${needsScroll ? 'overflow-x-auto scrollbar-horizontal' : ''} pb-2`}>
        <div className={`flex items-end gap-2 h-40 ${needsScroll ? 'min-w-max' : ''}`}>
          {data.map((item: any, index: number) => (
            <div key={index} className={`flex flex-col items-center gap-2 ${needsScroll ? 'min-w-[60px]' : 'flex-1'}`}>
              <div className="text-xs text-cp-cyan font-medium">{item.bookings}</div>
              <div className="w-full bg-cp-gray/30 rounded-t flex flex-col justify-end" style={{ height: '100px' }}>
                <div 
                  className="w-full bg-gradient-to-t from-cp-cyan to-cp-yellow rounded-t transition-all duration-500 hover:from-cp-yellow hover:to-cp-cyan"
                  style={{ height: `${maxValue > 0 ? (item.bookings / maxValue) * 100 : 0}%` }}
                />
              </div>
              <div className="text-xs text-gray-300 text-center max-w-[60px] break-words">
                {item.date}
              </div>
            </div>
          ))}
        </div>
        {needsScroll && (
          <div className="text-xs text-gray-400 mt-2 text-center">
            ← Scroll horizontally to view all days →
          </div>
        )}
      </div>
    )
  }

  const maxBookingActivity = Math.max(...analytics.bookingActivityStats.map(d => d.bookings), 1)
  const maxStationUsage = Math.max(...analytics.stationUsageStats.map(d => d.bookings), 1)

  return (
    <AdminGuard>
      <div className="min-h-screen bg-cp-black">
        
        
        <main className="pt-6 pb-12 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-4xl font-bold text-cp-yellow">
                    Analytics <span className="text-cp-cyan">Dashboard</span>
                  </h1>
                  <p className="text-gray-300 mt-2">Gaming center performance insights</p>
                </div>
                
                {/* Date Filter Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDateFilter('1day')}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                      dateFilter === '1day' 
                        ? 'bg-cp-cyan text-cp-black' 
                        : 'bg-cp-gray/20 text-gray-300 hover:bg-cp-cyan/20'
                    }`}
                  >
                    1 Day
                  </button>
                  <button
                    onClick={() => setDateFilter('7days')}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                      dateFilter === '7days' 
                        ? 'bg-cp-cyan text-cp-black' 
                        : 'bg-cp-gray/20 text-gray-300 hover:bg-cp-cyan/20'
                    }`}
                  >
                    7 Days
                  </button>
                  <button
                    onClick={() => setDateFilter('30days')}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                      dateFilter === '30days' 
                        ? 'bg-cp-cyan text-cp-black' 
                        : 'bg-cp-gray/20 text-gray-300 hover:bg-cp-cyan/20'
                    }`}
                  >
                    30 Days
                  </button>
                  <button
                    onClick={() => setShowCalendar(true)}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                      dateFilter === 'custom' 
                        ? 'bg-cp-cyan text-cp-black' 
                        : 'bg-cp-gray/20 text-gray-300 hover:bg-cp-cyan/20'
                    }`}
                  >
                    📅
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-cp-cyan">Loading analytics...</div>
            ) : (
              <div className="space-y-8">
                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                    <h3 className="text-cp-yellow font-bold mb-2">Total Revenue</h3>
                    <div className="text-3xl font-bold text-white">{formatCurrency(analytics.totalRevenue)}</div>
                  </div>
                  <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                    <h3 className="text-cp-yellow font-bold mb-2">Total Bookings</h3>
                    <div className="text-3xl font-bold text-white">{analytics.totalBookings}</div>
                  </div>
                  <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                    <h3 className="text-cp-yellow font-bold mb-2">Avg Booking Value</h3>
                    <div className="text-3xl font-bold text-white">{formatCurrency(analytics.avgBookingValue)}</div>
                  </div>
                  <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                    <h3 className="text-cp-yellow font-bold mb-2">PC vs PS5</h3>
                    <div className="text-sm text-gray-300">
                      <div>PC: {analytics.pcBookings}</div>
                      <div>PS5: {analytics.ps5Bookings}</div>
                    </div>
                  </div>
                </div>

                {/* Recent Bookings */}
                <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                  <h3 className="text-cp-yellow font-bold text-xl mb-4">Recent Bookings</h3>
                  <div className="space-y-3">
                    {analytics.recentBookings.map((booking: any, index: number) => (
                      <div key={index} className="flex justify-between items-center py-2 border-b border-cp-cyan/10">
                        <div>
                          <div className="text-white font-semibold">{booking.stations?.name}</div>
                          <div className="text-gray-400 text-sm">
                            Start: {new Date(booking.start_at).toLocaleDateString()} | 
                            Created: {new Date(booking.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-cp-yellow font-bold">{formatCurrency(booking.total_amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Station Type Breakdown */}
                <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                  <h3 className="text-cp-yellow font-bold text-xl mb-4">Station Type Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-cp-cyan mb-2">{analytics.pcBookings}</div>
                      <div className="text-gray-300">PC Bookings</div>
                      <div className="text-sm text-gray-400">
                        {analytics.totalBookings > 0 ? Math.round((analytics.pcBookings / analytics.totalBookings) * 100) : 0}% of total
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-cp-yellow mb-2">{analytics.ps5Bookings}</div>
                      <div className="text-gray-300">PS5 Bookings</div>
                      <div className="text-sm text-gray-400">
                        {analytics.totalBookings > 0 ? Math.round((analytics.ps5Bookings / analytics.totalBookings) * 100) : 0}% of total
                      </div>
                    </div>
                  </div>
                </div>

                {/* Booking Activity Chart */}
                <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                  <h3 className="text-cp-yellow font-bold text-xl mb-4">
                    Booking Activity - When Customers Booked ({
                      dateFilter === 'today' ? 'Today' :
                      dateFilter === '1day' ? 'Last 1 Day' :
                      dateFilter === '7days' ? 'Last 7 Days' :
                      dateFilter === '30days' ? 'Last 30 Days' :
                      'Custom Range'
                    })
                  </h3>
                  <DailyBookingsChart 
                    data={analytics.bookingActivityStats} 
                    maxValue={maxBookingActivity}
                  />
                </div>

                {/* Station Usage Chart */}
                <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                  <h3 className="text-cp-yellow font-bold text-xl mb-4">
                    Station Usage - When Slots Are Actually Used ({
                      dateFilter === 'today' ? 'Today' :
                      dateFilter === '1day' ? 'Last 1 Day' :
                      dateFilter === '7days' ? 'Last 7 Days' :
                      dateFilter === '30days' ? 'Last 30 Days' :
                      'Custom Range'
                    })
                  </h3>
                  <DailyBookingsChart 
                    data={analytics.stationUsageStats} 
                    maxValue={maxStationUsage}
                  />
                </div>

                {/* Station Booking Calendar */}
                <BookingCalendar
                  onDateSelect={handleDateSelect}
                  selectedDate={selectedDate}
                  bookingDates={bookingDates}
                />
              </div>
            )}
          </div>
        </main>

        {/* Date Bookings Modal */}
        <DateBookingsModal
          isOpen={showBookingsModal}
          onClose={() => setShowBookingsModal(false)}
          date={selectedDate || ''}
          stationBookings={dateBookings}
        />

        {/* Custom Date Range Modal */}
        {showCalendar && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCalendar(false)}>
            <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-cp-yellow font-bold text-xl">Select Date Range</h3>
                <button onClick={() => setShowCalendar(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={customRange.start}
                    onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white [color-scheme:dark]"
                    title="Select start date"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
                  <input
                    type="date"
                    value={customRange.end}
                    onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white [color-scheme:dark]"
                    title="Select end date"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (customRange.start && customRange.end) {
                        setDateFilter('custom')
                        setShowCalendar(false)
                      }
                    }}
                    disabled={!customRange.start || !customRange.end}
                    className="flex-1 bg-cp-cyan text-cp-black px-4 py-2 rounded hover:bg-cp-yellow disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setShowCalendar(false)}
                    className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  )
} 