'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { NavBar } from '@/components/ui/navbar'
import { Footer } from '@/components/ui/footer'
import { bookings, auth, stations } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'


function BookPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const stationId = searchParams.get('station')
  const stationName = searchParams.get('name') || 'Gaming Station'
  const stationRate = Number(searchParams.get('rate')) || 120
  const urlDate = searchParams.get('date') || ''
  const urlStartTime = searchParams.get('startTime') || ''
  const urlEndTime = searchParams.get('endTime') || ''

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState(urlDate)
  const [duration, setDuration] = useState(1)
  const [userCount, setUserCount] = useState(1)
  const [advancePayment, setAdvancePayment] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [stationType, setStationType] = useState<'PC' | 'PS5' | null>(null)
  const [assignedStationId, setAssignedStationId] = useState<string | null>(null)
  const [assignedStationRate, setAssignedStationRate] = useState<number>(stationRate)

  const validateCoupon = async (code: string) => {
    if (!code) return
    try {
      const { data: { session } } = await auth.getSession()
      const token = session?.access_token
      const response = await apiFetch(`/api/v1/validate-coupon?coupon_code=${code}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const result = await response.json()
      if (response.ok) {
        setCouponDiscount(result.discount_percentage)
      } else {
        setCouponDiscount(0)
        alert('Invalid coupon code')
      }
    } catch (error) {
      setCouponDiscount(0)
    }
  }

  // Check auth state with session persistence
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await auth.getSession()
      setUser(data.session?.user || null)
    }
    
    checkAuth()
    
    // Listen for auth changes
    const { data: { subscription } } = auth.onAuthChange((event, session) => {
      setUser(session?.user || null)
    })
    
    return () => subscription?.unsubscribe()
  }, [])

  // Initialize stationType from stationId if coming from /stations page
  useEffect(() => {
    if (stationId) {
      stations.getAll().then(({ data }) => {
        const station = data?.find((s: any) => s.id === stationId)
        if (station) {
          setStationType(station.type)
          setAssignedStationId(stationId)
          setAssignedStationRate(station.hourly_rate)
        }
      })
    }
  }, [stationId])

  const handleLogin = () => {
    const params = new URLSearchParams({
      station: stationId || '',
      name: stationName,
      rate: stationRate.toString(),
      date: selectedDate
    })
    router.push(`/auth?${params.toString()}`)
  }

  const handleBooking = async () => {
    if (!user || !selectedDate) {
      setError('Please select date')
      return
    }

    if (!stationType && !stationId) {
      setError('Please select PC or PS5')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Store date only for reservation; actual time is set during check-in
      const startAtIST = `${selectedDate} 00:00:00`
      const endAtIST = `${selectedDate} 23:59:59`
      
      const { error } = await bookings.create({
        user_id: user.id,
        station_id: assignedStationId || stationId || undefined,
        station_type: stationType || undefined,
        start_at: startAtIST,
        end_at: endAtIST,
        start_time: null,
        end_time: null,
        duration_hours: duration,
        user_count: userCount,
        advance_payment: advancePayment,
        food_items: [],
        food_total: 0,
        coupon_code: couponCode || null
      })

      if (error) {
        setError(error.message)
      } else {
        alert('Booking confirmed successfully!')
        router.push('/bookings')
      }
    } catch (err) {
      setError('Failed to create booking')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar />
      
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">
              {user ? 'CONFIRM' : 'BOOK'} <span className="text-cp-cyan">{user ? 'BOOKING' : 'NOW'}</span>
            </h1>
            <p className="text-xl text-gray-300">
              {user ? 'Complete your booking' : 'Book your gaming session'}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-8 mb-8">
            <div className="space-y-6">
              {/* Station Type Selector - Always show */}
              <div>
                <label className="block text-sm font-medium mb-4">Select Gaming Type</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setStationType('PC')
                      if (stationId && assignedStationId === stationId) {
                        setAssignedStationId(null)
                      }
                    }}
                    className={`flex-1 py-4 px-6 rounded-lg font-semibold transition-all duration-300 border-2 ${
                      stationType === 'PC'
                        ? 'bg-cp-cyan text-cp-black border-cp-cyan shadow-lg shadow-cp-cyan/25'
                        : 'bg-transparent text-cp-cyan border-cp-cyan hover:bg-cp-cyan hover:text-cp-black'
                    }`}
                  >
                    PC GAMING
                  </button>
                  <button
                    onClick={() => {
                      setStationType('PS5')
                      if (stationId && assignedStationId === stationId) {
                        setAssignedStationId(null)
                      }
                    }}
                    className={`flex-1 py-4 px-6 rounded-lg font-semibold transition-all duration-300 border-2 ${
                      stationType === 'PS5'
                        ? 'bg-cp-magenta text-white border-cp-magenta shadow-lg shadow-cp-magenta/25'
                        : 'bg-transparent text-cp-magenta border-cp-magenta hover:bg-cp-magenta hover:text-white'
                    }`}
                  >
                    PS5 GAMING
                  </button>
                </div>
              </div>

              {/* Show type and rate info if using type-based booking */}
              {stationType && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-300">Type:</span>
                    <div className="font-semibold">{stationType} Gaming</div>
                  </div>
                  <div>
                    <span className="text-gray-300">Rate:</span>
                    <div className="font-semibold text-cp-yellow">₹{assignedStationRate}/hour</div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Select Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-gray-900 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none text-white [color-scheme:dark]"
                  title="Select booking date"
                />
              </div>

              {selectedDate && (
                <div>
                  <label className="block text-sm font-medium mb-2">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => {
                      setDuration(Number(e.target.value))
                    }}
                    className="w-full bg-gray-900 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none text-white"
                    title="Select booking duration"
                  >
                    {[1,2,3,4,5,6,12,24,48].map(h => (
                      <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedDate && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {stationType === 'PS5' ? 'Number of Joystick' : stationType === 'PC' ? 'Number of PC' : 'Number of Users'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={userCount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '')
                      setUserCount(val ? Number(val) : 1)
                    }}
                    className="w-full bg-gray-900 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none text-white"
                    title="Enter number of users"
                  />
                </div>
              )}


              {user && selectedDate && (
                <div>
                  <label className="block text-sm font-medium mb-2">Coupon Code (Optional)</label>
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    onBlur={() => validateCoupon(couponCode)}
                    placeholder="Enter coupon code"
                    className="w-full bg-gray-900 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none text-white"
                  />
                  {couponDiscount > 0 && (
                    <div className="mt-1 text-sm text-green-400">
                      ✓ {couponDiscount}% discount applied
                    </div>
                  )}
                </div>
              )}


              {user && selectedDate && (
                <div className="border-t border-cp-cyan/20 pt-4">
                  <div className="text-sm text-gray-300 mb-2">
                    ₹{assignedStationRate || stationRate}/hour × {duration} hour{duration > 1 ? 's' : ''} × {userCount}{' '}
                    {stationType === 'PS5'
                      ? (userCount > 1 ? 'joysticks' : 'joystick')
                      : stationType === 'PC'
                      ? (userCount > 1 ? 'PCs' : 'PC')
                      : (userCount > 1 ? 'users' : 'user')}{' '}
                    {couponDiscount > 0 && `- ${couponDiscount}% off`}
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Total:</span>
                    <span className="text-white">
                      ₹{Math.round(
                        (assignedStationRate || stationRate) * duration * userCount -
                          ((assignedStationRate || stationRate) * duration * userCount) * couponDiscount / 100
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-center">
            {!user ? (
            <button
                onClick={handleLogin}
              disabled={!selectedDate || (!stationId && !stationType)}
              className="bg-cp-cyan text-cp-black px-8 py-4 rounded-lg font-bold text-lg hover:bg-cp-yellow transition-colors duration-300 shadow-lg shadow-cp-cyan/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              CONTINUE TO LOGIN
            </button>
            ) : (
              <button
                onClick={handleBooking}
                disabled={loading || !selectedDate || (!stationId && !stationType)}
                className="bg-cp-cyan text-cp-black px-8 py-4 rounded-lg font-bold text-lg hover:bg-cp-yellow transition-colors duration-300 shadow-lg shadow-cp-cyan/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'BOOKING...' : 'CONFIRM BOOKING'}
              </button>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-cp-cyan text-lg">Loading...</div></div>}>
      <BookPageContent />
    </Suspense>
  )
} 