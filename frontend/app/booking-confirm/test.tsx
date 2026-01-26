'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { NavBar } from '@/components/ui/navbar'
import { Footer } from '@/components/ui/footer'
import { bookings, auth } from '@/lib/supabase'

export default function BookingConfirmPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [startPeriod, setStartPeriod] = useState('AM')
  const [duration, setDuration] = useState(1)
  
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const stationId = searchParams.get('station')
  const stationName = searchParams.get('name') || 'Gaming Station'
  const stationRate = Number(searchParams.get('rate')) || 120

  useEffect(() => {
    const getUser = async () => {
      const { data } = await auth.getUser()
      if (!data.user) {
        router.push('/auth')
        return
      }
      setUser(data.user)
    }
    getUser()
  }, [router])

  const handleBooking = async () => {
    if (!user || !startDate || !startTime) {
      setError('Please select date and time')
      return
    }

    if (!stationId) {
      setError('Station ID is missing')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Convert 12-hour to 24-hour format
      const [hours, minutes] = startTime.split(':')
      let hour24 = parseInt(hours)
      if (startPeriod === 'PM' && hour24 !== 12) hour24 += 12
      if (startPeriod === 'AM' && hour24 === 12) hour24 = 0
      
      const startAt = new Date(`${startDate}T${hour24.toString().padStart(2, '0')}:${minutes}:00`)
      const endAt = new Date(startAt.getTime() + duration * 60 * 60 * 1000)
      
      const { error } = await bookings.create({
        user_id: user.id,
        station_id: stationId,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        total_amount: stationRate * duration,
        duration_hours: duration
      })

      if (error) {
        setError(error.message)
      } else {
        const pointsToEarn = Math.floor(stationRate * duration)
        alert(`Booking confirmed successfully! You'll earn ${pointsToEarn} points when payment is completed.`)
        router.push('/stations')
      }
    } catch (err) {
      setError('Failed to create booking')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return <div>Loading...</div>

  return (
    <div className="min-h-screen">
      <NavBar />
      
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">
              CONFIRM <span className="text-cp-cyan">BOOKING</span>
            </h1>
            <p className="text-gray-300">Complete your booking for {stationName}</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-300">Station:</span>
              <span className="font-semibold">{stationName}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Rate:</span>
              <span className="font-semibold text-cp-yellow">₹{stationRate}/hour</span>
            </div>

            <div className="space-y-2">
              <label htmlFor="start-date" className="block text-sm font-medium">Date</label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none text-white [color-scheme:dark]"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Time</label>
              <div className="flex gap-2">
                <select
                  aria-label="Select time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex-1 bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                >
                  {Array.from({length: 12}, (_, i) => {
                    const hour = i + 1
                    return ['00', '30'].map(min => (
                      <option key={`${hour}:${min}`} value={`${hour}:${min}`}>
                        {hour}:{min}
                      </option>
                    ))
                  }).flat()}
                </select>
                <select
                  aria-label="Select AM or PM"
                  value={startPeriod}
                  onChange={(e) => setStartPeriod(e.target.value)}
                  className="bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="duration" className="block text-sm font-medium">Duration (hours)</label>
              <select
                id="duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 focus:border-cp-cyan focus:outline-none"
              >
                {[1,2,3,4,5,6,12,24,48].map(h => (
                  <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-between text-lg font-bold">
              <span>Total:</span>
              <span className="text-cp-yellow">₹{stationRate * duration}</span>
            </div>

            <button
              onClick={handleBooking}
              disabled={loading}
              className="w-full bg-cp-cyan text-cp-black py-3 rounded-lg font-bold hover:bg-cp-yellow transition-colors duration-300 disabled:opacity-50"
            >
              {loading ? 'BOOKING...' : 'CONFIRM BOOKING'}
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
} 