'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { NavBar } from '@/components/ui/navbar'
import { Footer } from '@/components/ui/footer'
import { bookings, auth } from '@/lib/supabase'

export default function BookingsPage() {
  const [activeTab, setActiveTab] = useState('upcoming')
  const [userBookings, setUserBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const [error, setError] = useState('')
  const [cancellingBooking, setCancellingBooking] = useState<any>(null)
  const [cancelResult, setCancelResult] = useState<any>(null)
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'UPCOMING': return 'bg-blue-500/20 text-blue-400'
      case 'ONGOING': return 'bg-green-500/20 text-green-400'
      case 'ENDED': return 'bg-gray-500/20 text-gray-400'
      case 'CANCELLED': return 'bg-red-500/20 text-red-400'
      default: return 'bg-yellow-500/20 text-yellow-400'
    }
  }

  // Check auth state
  useEffect(() => {
    const getUser = async () => {
      const { data } = await auth.getUser()
      if (!data.user) {
        router.push('/auth')
        return
      }
      setUser(data.user)
      
      const { data: bookingData } = await bookings.getUserBookings(data.user.id)
      const uniqueBookings = Array.from(new Map((bookingData || []).map((b: any) => [b.id, b])).values())
      setUserBookings(uniqueBookings)
      setLoading(false)
    }
    getUser()
  }, [router])

  const categorizeBookings = (bookings: any[]) => ({
    upcoming: bookings.filter(b => ['UPCOMING', 'PENDING', 'PARTIAL'].includes(b.status)),
    ongoing: bookings.filter(b => ['ONGOING', 'IN_PROGRESS'].includes(b.status)),
      ended: bookings.filter(b => b.status === 'ENDED'),
      cancelled: bookings.filter(b => b.status === 'CANCELLED')
  })

  const categories = categorizeBookings(userBookings)

  const calculateRefund = (booking: any) => {
    const createdAt = new Date(booking.created_at)
    const now = new Date()
    const timeElapsed = now.getTime() - createdAt.getTime()
    const oneHour = 60 * 60 * 1000
    
    const amountPaid = booking.amount_paid || 0
    
    if (timeElapsed <= oneHour) {
      return { refund: amountPaid, fee: 0 }
    } else {
      const fee = Math.round(amountPaid * 0.05 * 100) / 100
      return { refund: amountPaid - fee, fee }
    }
  }

  const handleCancelBooking = async (booking: any) => {
    try {
      const result = await bookings.cancel(booking.id)
      if (result.error) {
        setError(result.error.message)
      } else {
        setCancelResult(result.data)
        setCancellingBooking(null)
        // Reload bookings
        const { data: bookingData } = await bookings.getUserBookings(user.id)
        const uniqueBookings = Array.from(new Map((bookingData || []).map((b: any) => [b.id, b])).values())
        setUserBookings(uniqueBookings)
      }
    } catch (error) {
      setError('Failed to cancel booking')
    }
  }
  const tabs = [
    { id: 'upcoming', label: 'Upcoming', count: categories.upcoming.length },
    { id: 'ongoing', label: 'Ongoing', count: categories.ongoing.length },
    { id: 'ended', label: 'Ended', count: categories.ended.length },
    { id: 'cancelled', label: 'Cancelled', count: categories.cancelled.length }
  ]

  const BookingCard = ({ booking }: { booking: any }) => {
    const hasScheduledTime = Boolean(booking.start_time && booking.end_time)
    
    return (
    <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6 mb-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-gray-400 text-sm">Date:</span>
          <p className="font-semibold">{new Date(booking.start_at).toLocaleDateString()}</p>
        </div>
        <div>
          <span className="text-gray-400 text-sm">Schedule:</span>
          <p className="font-semibold">
            {hasScheduledTime
              ? `${booking.start_time?.slice(0, 5) || 'N/A'} - ${booking.end_time?.slice(0, 5) || 'N/A'}`
              : 'Set when you check in at the cafe'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-gray-400 text-sm">Station:</span>
          <p className="font-semibold">{booking.stations?.name}</p>
        </div>
        <div>
          <span className="text-gray-400 text-sm">Status:</span>
          <span className={`px-2 py-1 rounded text-xs ${getStatusColor(booking.status)}`}>
            {booking.status}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-gray-400 text-sm">Payment:</span>
          <p className="font-semibold text-cp-yellow">₹{booking.total_amount || 0}</p>
          {booking.advance_paid ? (
            <p className="text-xs text-cp-cyan">Advance paid: ₹{booking.advance_amount}</p>
          ) : Number(booking.advance_amount) > 0 && booking.status !== 'CANCELLED' ? (
            <p className="text-xs text-cp-cyan">Advance due at the counter: ₹{booking.advance_amount}</p>
          ) : null}
        </div>
        <div>
          <span className="text-gray-400 text-sm">Payment Status:</span>
          {(() => {
            const label =
              booking.payment_status === 'PAID' || booking.payment_status === 'PREPAID' ? 'Paid'
              : booking.payment_status === 'PARTIAL' ? 'Partially Paid'
              : booking.payment_status === 'ADVANCE_PAID' || booking.advance_paid ? 'Advance Paid'
              : 'Pending'
            const tone = label === 'Paid' ? 'bg-green-500/20 text-green-400' : label === 'Pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
            return <span className={`px-2 py-1 rounded text-xs ${tone}`}>{label}</span>
          })()}
        </div>
      </div>
    </div>
  )}

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen">
      <NavBar />
      
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">
              MY <span className="text-cp-cyan">BOOKINGS</span>
            </h1>
            <p className="text-gray-300">Track your gaming sessions</p>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cp-cyan text-cp-black'
                    : 'bg-cp-gray/20 text-gray-300 hover:bg-cp-cyan/20'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Bookings List */}
          <div>
            {categories[activeTab as keyof typeof categories].length === 0 ? (
              <div className="text-center py-12">
                <p className="text-xl text-gray-400">No {activeTab} bookings found</p>
              </div>
            ) : (
              categories[activeTab as keyof typeof categories].map((booking: any) => (
                <div key={booking.id} className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6 mb-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-cp-yellow font-bold text-xl mb-2">{booking.stations?.name}</h3>
                      <p className="text-gray-300">{new Date(booking.start_at).toLocaleDateString()}</p>
                      <p className="text-white">Time: {booking.start_time?.slice(0, 5)} - {booking.end_time?.slice(0, 5)}</p>
                      <p className="text-cp-cyan font-semibold">₹{booking.total_amount}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className={`px-3 py-1 rounded text-sm font-bold ${getStatusColor(booking.status)}`}>
                        {booking.status}
                      </span>
                      {booking.status === 'UPCOMING' && (
                        <button
                          onClick={() => setCancellingBooking(booking)}
                          className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <Footer />
      
      {/* Cancel Confirmation Modal */}
      {cancellingBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-cp-yellow font-bold text-xl mb-4">Cancel Booking</h3>
            <div className="bg-cp-black/30 rounded p-3 mb-4">
              <p className="text-cp-cyan font-bold">{cancellingBooking.stations?.name}</p>
              <p className="text-white text-sm">{new Date(cancellingBooking.start_at).toLocaleDateString()}</p>
              <p className="text-cp-yellow">₹{cancellingBooking.total_amount}</p>
            </div>
            
            {(() => {
              const refundInfo = calculateRefund(cancellingBooking)
              return (
                <div className="bg-cp-cyan/10 rounded p-3 mb-4">
                  <p className="text-white font-semibold mb-2">Refund Information:</p>
                  {refundInfo.fee > 0 ? (
                    <>
                      <p className="text-red-400">Cancellation Fee: ₹{refundInfo.fee}</p>
                      <p className="text-cp-cyan">Refund Amount: ₹{refundInfo.refund}</p>
                      <p className="text-gray-300 text-sm mt-2">
                        5% cancellation fee applies after 1 hour grace period
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-cp-cyan">Full Refund: ₹{refundInfo.refund}</p>
                      <p className="text-gray-300 text-sm mt-2">
                        Free cancellation within 1 hour
                      </p>
                    </>
                  )}
                </div>
              )
            })()}
            
            <div className="flex gap-2">
              <button
                onClick={() => handleCancelBooking(cancellingBooking)}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                Confirm Cancellation
              </button>
              <button
                onClick={() => setCancellingBooking(null)}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                Keep Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Result Modal */}
      {cancelResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-cp-yellow font-bold text-xl mb-4">Booking Cancelled</h3>
            <div className="bg-cp-cyan/10 rounded p-3 mb-4">
              <p className="text-cp-cyan">Refund Amount: ₹{cancelResult.refund_amount}</p>
              {cancelResult.cancellation_fee > 0 && (
                <p className="text-red-400">Cancellation Fee: ₹{cancelResult.cancellation_fee}</p>
              )}
            </div>
            <button
              onClick={() => setCancelResult(null)}
              className="bg-cp-cyan text-cp-black px-4 py-2 rounded hover:bg-cp-yellow"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 