'use client'

import { useState, useEffect } from 'react'
import { AdminGuard } from '@/components/ui/admin-guard'
import { bookings, admin } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'


// Booking Edit Modal Component
const BookingModal = ({ booking, onSave, onClose }: any) => {
  const [formData, setFormData] = useState({
    start_time: booking?.start_time || '',
    end_time: booking?.end_time || '',
    duration_hours: booking?.duration_hours || 1,
    total_amount: booking?.total_amount || 0,
    status: booking?.status || 'UPCOMING',
    discount_type: booking?.discount_type || 'NONE',
    discount_value: booking?.discount_value || 0,
    hourly_rate: booking?.custom_hourly_rate || booking?.stations?.hourly_rate || 0,
    user_count: booking?.user_count || 1
  })

  // Live calculation when fields change
  useEffect(() => {
    const user_count = formData.user_count || 1
    const food_total = booking?.food_total || 0
    
    // Calculate original amount
    const original_amount = (formData.hourly_rate * formData.duration_hours * user_count) + food_total
    
    // Apply discount
    let discount_amount = 0
    if (formData.discount_type === 'PERCENTAGE') {
      discount_amount = original_amount * (formData.discount_value / 100)
    } else if (formData.discount_type === 'AMOUNT') {
      discount_amount = Math.min(formData.discount_value, original_amount)
    }
    
    const new_total = Math.max(0, original_amount - discount_amount)
    
    // Update total_amount if it changed (avoid infinite loop)
    if (Math.abs(formData.total_amount - new_total) > 0.01) {
      setFormData(prev => ({...prev, total_amount: new_total}))
    }
  }, [formData.hourly_rate, formData.duration_hours, formData.discount_type, formData.discount_value, formData.user_count, booking?.food_total])

  const handleSave = () => {
    onSave({ ...booking, ...formData })
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h3 className="text-cp-yellow font-bold text-xl mb-4">Edit Booking</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white text-sm mb-1">Start Time</label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                className="bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white w-full"
              />
            </div>
            <div>
              <label className="block text-white text-sm mb-1">End Time</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                className="bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white text-sm mb-1">Duration (hours)</label>
              <input
                type="number"
                value={formData.duration_hours}
                onChange={(e) => setFormData({...formData, duration_hours: Number(e.target.value)})}
                className="bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white w-full"
              />
            </div>
            <div>
              <label className="block text-white text-sm mb-1">Joysticks/Users</label>
              <input
                type="number"
                min="1"
                value={formData.user_count}
                onChange={(e) => setFormData({...formData, user_count: Number(e.target.value) || 1})}
                className="bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white w-full"
              />
            </div>
            <div>
              <label className="block text-white text-sm mb-1">Total Amount</label>
              <input
                type="number"
                value={formData.total_amount}
                onChange={(e) => setFormData({...formData, total_amount: Number(e.target.value)})}
                className="bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white w-full"
              />
            </div>
            <div>
              <label className="block text-white text-sm mb-1">Price per Hour</label>
              <input
                type="number"
                value={formData.hourly_rate}
                onChange={(e) => setFormData({...formData, hourly_rate: Number(e.target.value)})}
                className="bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white text-sm mb-1">Discount Type</label>
              <select
                value={formData.discount_type}
                onChange={(e) => setFormData({...formData, discount_type: e.target.value, discount_value: 0})}
                className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white"
              >
                <option value="NONE">No Discount</option>
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="AMOUNT">Fixed Amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-white text-sm mb-1">
                Discount {formData.discount_type === 'PERCENTAGE' ? '(%)' : formData.discount_type === 'AMOUNT' ? '(₹)' : ''}
              </label>
              <input
                type="number"
                value={formData.discount_value}
                onChange={(e) => setFormData({...formData, discount_value: Number(e.target.value)})}
                disabled={formData.discount_type === 'NONE'}
                className="bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white w-full disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div>
            <label className="block text-white text-sm mb-1">Booking Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
              className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white"
            >
              <option value="UPCOMING">Upcoming</option>
              <option value="ONGOING">Ongoing</option>
              <option value="ENDED">Ended</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="bg-cp-cyan text-cp-black px-4 py-2 rounded hover:bg-cp-yellow"
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Delete Confirmation Modal Component
const DeleteModal = ({ booking, onConfirm, onClose }: any) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h3 className="text-cp-yellow font-bold text-xl mb-4">Cancel Booking</h3>
        <p className="text-white mb-2">Are you sure you want to cancel this booking?</p>
        <div className="bg-cp-black/30 rounded p-3 mb-4">
          <p className="text-cp-cyan font-bold">{booking?.stations?.name || 'Unknown Station'}</p>
          <p className="text-gray-300 text-sm">{booking?.stations?.type}</p>
          <p className="text-white text-sm mt-1">
            {new Date(booking?.start_at).toLocaleDateString()} | {booking?.start_time?.slice(0, 5)} - {booking?.end_time?.slice(0, 5)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Cancel Booking
          </button>
          <button
            onClick={onClose}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            Keep Booking
          </button>
        </div>
      </div>
    </div>
  )
}

// View Booking Details Modal Component
const ViewModal = ({ booking, onClose }: any) => {
  // Calculate expected end time based on timer
  const getExpectedEndTime = () => {
    if (!booking?.start_at) return booking?.end_time?.slice(0, 5) || 'N/A'
    
    const startAt = new Date(booking.start_at)
    const durationHours = booking.duration_hours || 1
    
    // Calculate elapsed time from timer
    let elapsedSeconds = booking.timer_total_seconds || 0
    if (booking.timer_started_at) {
      const started = new Date(booking.timer_started_at).getTime()
      const now = Date.now()
      elapsedSeconds += Math.floor((now - started) / 1000)
    }
    
    // Expected end = start + duration + elapsed time
    const expectedEnd = new Date(startAt.getTime() + (durationHours * 3600 * 1000) + (elapsedSeconds * 1000))
    return expectedEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // Parse food items
  let foodItems: string[] = []
  try {
    if (booking?.food_items) {
      if (Array.isArray(booking.food_items)) {
        foodItems = booking.food_items
      } else if (typeof booking.food_items === 'string') {
        foodItems = JSON.parse(booking.food_items || '[]')
      }
    }
  } catch (e) {
    console.error('Error parsing food_items:', e)
    foodItems = []
  }
  const foodTotal = Number(booking?.food_total) || 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 w-full max-w-2xl max-h-96 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-cp-yellow font-bold text-xl mb-4">Booking Details</h3>
        <div className="grid grid-cols-2 gap-4 text-white text-sm">
          <div><strong>ID:</strong> {booking?.id}</div>
          <div><strong>User:</strong> {booking?.user_profiles?.username || 'Unknown'}</div>
          <div><strong>Station:</strong> {booking?.stations?.name || 'Not assigned'}</div>
          <div><strong>Type:</strong> {booking?.stations?.type || 'N/A'}</div>
          <div><strong>Created:</strong> {new Date(booking?.created_at).toLocaleString()}</div>
          <div><strong>Play Date:</strong> {new Date(booking?.start_at).toLocaleDateString()}</div>
          <div><strong>Start Time:</strong> {booking?.start_time?.slice(0, 5) || 'N/A'}</div>
          <div><strong>Expected End Time:</strong> {getExpectedEndTime()}</div>
          <div><strong>Duration:</strong> {booking?.duration_hours}h</div>
          <div><strong>Joysticks/Users:</strong> {booking?.user_count || 1}</div>
          <div><strong>Amount:</strong> ₹{booking?.total_amount}</div>
          {(foodItems.length > 0 || foodTotal > 0) && (
            <>
              <div className="col-span-2"><strong>Food Items:</strong> {foodItems.length > 0 ? foodItems.join(', ') : 'None'}</div>
              <div><strong>Food Total:</strong> ₹{foodTotal}</div>
            </>
          )}
          <div><strong>Status:</strong> {booking?.status}</div>
          <div><strong>Paid:</strong> {booking?.paid ? 'Yes' : 'No'}</div>
          {booking?.advance_amount > 0 && (
            <>
              <div><strong>Advance Paid:</strong> ₹{booking?.advance_amount}</div>
              <div><strong>Advance Method:</strong> {booking?.advance_payment_method || 'N/A'}</div>
            </>
          )}
          <div><strong>Amount Paid:</strong> ₹{booking?.amount_paid || 0}</div>
          <div><strong>Balance Due:</strong> ₹{booking?.remaining_amount || 0}</div>
          {booking?.coupon_code && (
            <>
              <div><strong>Coupon Used:</strong> {booking?.coupon_code}</div>
              <div><strong>Coupon Discount:</strong> ₹{booking?.coupon_discount || 0}</div>
            </>
          )}
        </div>
        <button onClick={onClose} className="mt-4 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">Close</button>
      </div>
    </div>
  )
}


export default function AdminBookings() {
  const [activeBookings, setActiveBookings] = useState<any[]>([])
  const [cancelledBookings, setCancelledBookings] = useState<any[]>([])
  const [filteredActive, setFilteredActive] = useState<any[]>([])
  const [filteredCancelled, setFilteredCancelled] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingBooking, setEditingBooking] = useState<any>(null)
  const [deletingBooking, setDeletingBooking] = useState<any>(null)
  const [viewingBooking, setViewingBooking] = useState<any>(null)
  const [filter, setFilter] = useState<string>('ALL')
  const [showCancelled, setShowCancelled] = useState(false)
  const [userProfiles, setUserProfiles] = useState<any>({})
  const [editingPayment, setEditingPayment] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [activePage, setActivePage] = useState(1)
  const [cancelledPage, setCancelledPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [activeTotal, setActiveTotal] = useState(0)
  const [cancelledTotal, setCancelledTotal] = useState(0)
  const [viewMode, setViewMode] = useState<'list' | 'stations'>('stations')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [stationsData, setStationsData] = useState<any[]>([])
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH')
  const [checkoutPaid, setCheckoutPaid] = useState<boolean>(true)
  const [checkoutRemainingAmount, setCheckoutRemainingAmount] = useState<number>(0)
  const [advanceBookingId, setAdvanceBookingId] = useState<string | null>(null)
  const [advanceAmount, setAdvanceAmount] = useState<number>(0)
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState<string>('CASH')
  const [advanceTotalAmount, setAdvanceTotalAmount] = useState<number>(0)
  const [selectedStations, setSelectedStations] = useState<{[key: string]: string}>({})
  const [openStationMenuId, setOpenStationMenuId] = useState<string | null>(null)
  const [timerUpdates, setTimerUpdates] = useState<{[key: string]: number}>({})

  useEffect(() => {
    loadBookings()
  }, [activePage, cancelledPage])

  useEffect(() => {
    if (viewMode === 'stations') {
      loadStationsWithReservations()
    }
  }, [selectedDate, viewMode])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openMenuId && !(e.target as HTMLElement).closest('.menu-container')) {
        setOpenMenuId(null)
      }
      if (openStationMenuId && !(e.target as HTMLElement).closest('.menu-container')) {
        setOpenStationMenuId(null)
      }
    }
    if (openMenuId || openStationMenuId) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openMenuId, openStationMenuId])

  useEffect(() => {
    // Update timer display every second for running timers
    const interval = setInterval(() => {
      const updates: {[key: string]: number} = {}
      stationsData.forEach((sd: any) => {
        (sd.reservations || []).forEach((r: any) => {
          if (r.checked_in_at && r.timer_started_at) {
            updates[r.id] = Date.now()
          }
        })
      })
      if (Object.keys(updates).length > 0) {
        setTimerUpdates(updates)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [stationsData])

  useEffect(() => {
    // Reset to page 1 when filter or search changes
    setActivePage(1)
    setCancelledPage(1)
  }, [filter, searchTerm])

  useEffect(() => {
    // Apply search and filter to active bookings
    let filtered = activeBookings
    
    // Apply type filter
    if (filter !== 'ALL') {
      filtered = filtered.filter(booking => booking.stations?.type === filter)
    }
    
    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(booking => 
        (booking.user_profiles?.username || '').toLowerCase().includes(term) ||
        (booking.user_profiles?.full_name || '').toLowerCase().includes(term) ||
        (booking.stations?.name || '').toLowerCase().includes(term) ||
        booking.id.toLowerCase().includes(term) ||
        booking.total_amount?.toString().includes(term)
      )
    }
    
    setFilteredActive(filtered)
    
    // Apply same logic to cancelled bookings
    let filteredCancelled = cancelledBookings
    
    if (filter !== 'ALL') {
      filteredCancelled = filteredCancelled.filter(booking => booking.stations?.type === filter)
    }
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filteredCancelled = filteredCancelled.filter(booking => 
        (booking.user_profiles?.username || '').toLowerCase().includes(term) ||
        (booking.user_profiles?.full_name || '').toLowerCase().includes(term) ||
        (booking.stations?.name || '').toLowerCase().includes(term) ||
        booking.id.toLowerCase().includes(term) ||
        booking.total_amount?.toString().includes(term)
      )
    }
    
    setFilteredCancelled(filteredCancelled)
  }, [activeBookings, cancelledBookings, filter, searchTerm])

  // Helper function to calculate remaining time
  const calculateRemainingTime = (booking: any) => {
    const durationMs = (booking.duration_hours || 1) * 3600 * 1000
    const elapsedMs = (booking.timer_total_seconds || 0) * 1000
    const currentElapsed = booking.timer_started_at ? 
      Date.now() - new Date(booking.timer_started_at).getTime() : 0
    return durationMs - (elapsedMs + currentElapsed)
  }

  // Auto-start grace time and auto-extend bookings
  useEffect(() => {
    const interval = setInterval(() => {
      stationsData.forEach(station => {
        station.bookings?.forEach((booking: any) => {
          if (booking.status === 'ONGOING' && booking.timer_started_at && !booking.grace_time_started_at) {
            const remainingMs = calculateRemainingTime(booking)
            if (remainingMs <= 0) {
              // Start grace time
              apiFetch(`/api/v1/admin/bookings/${booking.id}/start-grace`, {
                method: 'POST'
              })
              .then(() => loadStationsWithReservations())
              .catch(console.error)
            }
          }
          
          // Auto-extend when grace time ends
          if (booking.grace_time_started_at) {
            const graceElapsed = Date.now() - new Date(booking.grace_time_started_at).getTime()
            if (graceElapsed >= 60000) { // 60 seconds
              apiFetch(`/api/v1/admin/bookings/${booking.id}/extend-hour`, {
                method: 'POST'
              })
              .then(() => loadStationsWithReservations())
              .catch(console.error)
            }
          }
        })
      })
    }, 1000) // Check every second

    return () => clearInterval(interval)
  }, [stationsData])

  const loadBookings = async () => {
    setLoading(true)
    try {
      const [activeResult, cancelledResult] = await Promise.all([
        bookings.getAllBookings(activePage, itemsPerPage),
        bookings.getAllCancelledBookings(cancelledPage, itemsPerPage)
      ])
      
      // Get user details for each booking
      const activeWithUsers = await addUserDetails(activeResult.data || [])
      const cancelledWithUsers = await addUserDetails(cancelledResult.data || [])
      
      setActiveBookings(activeWithUsers)
      setCancelledBookings(cancelledWithUsers)
      setActiveTotal(activeResult.total || 0)
      setCancelledTotal(cancelledResult.total || 0)
    } catch (error) {
      console.error('Error loading bookings:', error)
    } finally {
      setLoading(false)
    }
  }

  const addUserDetails = async (bookingList: any[]) => {
    if (!bookingList.length) return bookingList
    
    // Get unique user IDs
    const userIds = Array.from(new Set(bookingList.map(b => b.user_id)))
    
    // Fetch user profiles using admin function
    const userProfiles: any = {}
    try {
      const { data, error } = await admin.getUserProfiles(userIds)
      if (error) {
        console.error('Error fetching user profiles:', error)
      } else if (data && Array.isArray(data)) {
        data.forEach((profile: any) => {
          userProfiles[profile.user_id] = { username: profile.username, full_name: profile.full_name }
        })
      }
    } catch (error) {
      console.error('Error fetching user profiles:', error)
    }
    
    // Add user details to bookings
    return bookingList.map(booking => ({
      ...booking,
      user_profiles: userProfiles[booking.user_id] || null
    }))
  }

  const handleCancel = async (bookingId: string) => {
    try {
      console.log('Attempting to cancel booking:', bookingId)
      const result = await bookings.cancel(bookingId)
      console.log('Cancel result:', result)
      
      if (result.error) {
        console.error('API error:', result.error)
        alert('Failed to cancel booking: ' + result.error.message)
        return
      }
      
      setDeletingBooking(null)
      loadBookings()
      if (viewMode === 'stations') {
        loadStationsWithReservations()
      }
    } catch (error) {
      console.error('Error cancelling booking:', error)
      alert('Failed to cancel booking')
    }
  }

  const handleSave = async (booking: any) => {
    try {
      await bookings.update(booking.id, booking)
      setEditingBooking(null)
      loadBookings()
      if (viewMode === 'stations') {
        loadStationsWithReservations()
      }
    } catch (error) {
      console.error('Error saving booking:', error)
    }
  }

  const handleUpdatePayment = async (bookingId: string, amount: number) => {
    try {
      const response = await apiFetch(`/api/v1/admin/bookings/${bookingId}/payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_paid: amount })
      })
      if (response.ok) {
        loadBookings()
        setEditingPayment(null)
      }
    } catch (error) {
      console.error('Payment update failed:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A'
    return timeString.slice(0, 5) // Already IST from database
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'UPCOMING': return 'bg-blue-600'
      case 'ONGOING': return 'bg-green-600'
      case 'ENDED': return 'bg-gray-600'
      case 'CANCELLED': return 'bg-red-600'
      default: return 'bg-gray-600'
    }
  }

  const formatTimer = (booking: any) => {
    const totalSeconds = booking.timer_total_seconds || 0
    const startedAt = booking.timer_started_at
    
    let currentSeconds = totalSeconds
    if (startedAt) {
      const started = new Date(startedAt).getTime()
      const now = Date.now()
      currentSeconds = totalSeconds + Math.floor((now - started) / 1000)
    }
    
    const hours = Math.floor(currentSeconds / 3600)
    const minutes = Math.floor((currentSeconds % 3600) / 60)
    const seconds = currentSeconds % 60
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const formatRemainingTimer = (booking: any) => {
    const durationHours = booking.duration_hours || 1
    const totalSeconds = durationHours * 3600
    
    const elapsedSeconds = (() => {
      const totalElapsed = booking.timer_total_seconds || 0
      const startedAt = booking.timer_started_at
      
      if (startedAt) {
        const started = new Date(startedAt).getTime()
        const now = Date.now()
        return totalElapsed + Math.floor((now - started) / 1000)
      }
      return totalElapsed
    })()
    
    const remainingSeconds = totalSeconds - elapsedSeconds
    
    // If time is up, check for grace period
    if (remainingSeconds <= 0) {
      const graceStarted = booking.grace_time_started_at
      if (graceStarted) {
        const graceElapsed = Math.floor((Date.now() - new Date(graceStarted).getTime()) / 1000)
        const graceRemaining = Math.max(0, 60 - graceElapsed) // 60 seconds grace
        
        if (graceRemaining > 0) {
          return `Grace: 00:${graceRemaining.toString().padStart(2, '0')}`
        } else {
          return 'EXTENDING...'
        }
      }
      return '00:00:00'
    }
    
    const hours = Math.floor(remainingSeconds / 3600)
    const minutes = Math.floor((remainingSeconds % 3600) / 60)
    const seconds = remainingSeconds % 60
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const handleStartTimer = async (bookingId: string) => {
    try {
      const { error } = await admin.startTimer(bookingId)
      if (error) {
        alert('Failed to start timer: ' + error.message)
      } else {
        loadStationsWithReservations()
      }
    } catch (error) {
      alert('Failed to start timer')
    }
  }

  const handleStopTimer = async (bookingId: string) => {
    try {
      const { error } = await admin.stopTimer(bookingId)
      if (error) {
        alert('Failed to stop timer: ' + error.message)
      } else {
        loadStationsWithReservations()
      }
    } catch (error) {
      alert('Failed to stop timer')
    }
  }

  const loadStationsWithReservations = async () => {
    setLoading(true)
    try {
      const { data, error } = await admin.getStationsWithReservations(selectedDate)
      if (error) {
        console.error('Error loading stations:', error)
        setStationsData([])
      } else {
        setStationsData(data || [])
      }
    } catch (error) {
      console.error('Error loading stations:', error)
      setStationsData([])
    } finally {
      setLoading(false)
    }
  }

  const handleCheckin = async (bookingId: string, stationId: string) => {
    try {
      const { error } = await admin.checkinBooking(bookingId, stationId)
      if (error) {
        alert('Check-in failed: ' + error.message)
      } else {
        loadStationsWithReservations()
      }
    } catch (error) {
      alert('Failed to check in')
    }
  }

  const handleCheckout = async () => {
    if (!checkoutBookingId) return
    try {
      await admin.stopTimer(checkoutBookingId).catch(() => {})
      const { error } = await bookings.update(checkoutBookingId, { 
        status: "ENDED", checked_in: false, payment_method: paymentMethod, paid: checkoutPaid, payment_status: checkoutPaid ? 'PAID' : 'PENDING' 
      })
      if (error) alert('Checkout failed: ' + error.message)
      else loadStationsWithReservations()
    } catch (error) {
      alert('Failed to checkout')
    }
    setCheckoutBookingId(null)
    setPaymentMethod('CASH')
    setCheckoutPaid(true)
  }

  const handleAdvancePosting = async () => {
    if (!advanceBookingId || advanceAmount <= 0) return
    try {
      const remaining = advanceTotalAmount - advanceAmount
      const { error } = await bookings.update(advanceBookingId, {
        advance_amount: advanceAmount,
        advance_paid: true,
        advance_payment_method: advancePaymentMethod,
        amount_paid: advanceAmount,
        remaining_amount: remaining,
        payment_status: remaining === 0 ? 'PAID' : 'PARTIAL'
      })
      if (error) alert('Failed: ' + error.message)
      else loadStationsWithReservations()
    } catch (e) {
      alert('Failed to post advance')
    }
    setAdvanceBookingId(null)
    setAdvanceAmount(0)
    setAdvancePaymentMethod('CASH')
  }

  const handleGenerateReceipt = async (bookingId: string) => {
    try {
      const { error } = await admin.generateReceipt(bookingId)
      if (error) {
        alert('Failed to generate receipt: ' + error.message)
      }
    } catch (error) {
      alert('Failed to generate receipt')
    }
  }

  const getStationStatus = (stationData: any) => {
    const reservations = stationData.reservations || []
    const checkedIn = reservations.filter((r: any) => r.checked_in_at)
    const pending = reservations.filter((r: any) => !r.checked_in_at)
    if (checkedIn.length > 0) return 'occupied'
    if (pending.length > 0) return 'pending'
    return 'available'
  }

  return (
    <AdminGuard>
      <div className="min-h-screen">
        
        <main className="pt-6 pb-12 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-cp-yellow">
                Booking <span className="text-cp-cyan">Management</span>
              </h1>
              <p className="text-gray-300 mt-2">View and manage all bookings</p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    viewMode === 'list' 
                      ? 'bg-cp-cyan text-cp-black' 
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  List View
                </button>
                <button
                  onClick={() => setViewMode('stations')}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    viewMode === 'stations' 
                      ? 'bg-cp-cyan text-cp-black' 
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  Station View
                </button>
              </div>
            </div>

            {viewMode === 'stations' && (
              <div className="mb-6">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-cp-black/50 border border-cp-cyan/30 rounded px-4 py-2 text-white"
                />
              </div>
            )}

            {/* Filter and Search Section */}
            {viewMode === 'list' && (
            <div className="mb-6 space-y-4">
              {/* Search Input */}
              <div className="flex gap-4 items-center">
                <div className="flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search by username, station name, amount..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white placeholder-gray-400 focus:border-cp-cyan focus:outline-none"
                  />
                </div>
            </div>

            {/* Filter Buttons */}
              <div className="flex gap-4 items-center">
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('ALL')}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    filter === 'ALL' 
                      ? 'bg-cp-cyan text-cp-black' 
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  ALL
                </button>
                <button
                  onClick={() => setFilter('PC')}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    filter === 'PC' 
                      ? 'bg-cp-cyan text-cp-black' 
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  PC
                </button>
                <button
                  onClick={() => setFilter('PS5')}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    filter === 'PS5' 
                      ? 'bg-cp-cyan text-cp-black' 
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  PS5
                </button>
              </div>
              <div className="text-gray-400 text-sm">
                Showing {filteredActive.length} of {activeTotal} active bookings
              </div>
              <button
                onClick={() => setShowCancelled(!showCancelled)}
                className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-500"
              >
                {showCancelled ? 'Hide' : 'Show'} Cancelled ({filteredCancelled.length})
              </button>
              </div>
            </div>
            )}

            {viewMode === 'list' ? (
            <>
            {/* Active Bookings */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-cp-cyan">Active Bookings</h2>
              {loading ? (
                <div className="text-center text-cp-cyan">Loading bookings...</div>
              ) : (
                filteredActive.map((booking: any) => (
                  <div key={booking.id} className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
                    <div className="flex justify-between items-start">
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1">
                        <div>
                          <h3 className="text-cp-yellow font-bold">{booking.stations?.name || 'Unknown Station'}</h3>
                          <p className="text-gray-300 text-sm">{booking.stations?.type}</p>
                        </div>
                        <div>
                          <p className="text-white"><strong>User:</strong> {booking.user_profiles?.username || 'Unknown'}</p>
                          <p className="text-gray-300 text-sm">{booking.user_profiles?.full_name || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-white"><strong>Created:</strong> {formatDate(booking.created_at)}</p>
                          <p className="text-white"><strong>Play Date:</strong> {formatDate(booking.start_at)}</p>
                          <p className="text-white"><strong>Time:</strong> {formatTime(booking.start_time)} - {formatTime(booking.end_time)}</p>
                        </div>
                        <div>
                          <p className="text-white"><strong>Duration:</strong> {booking.duration_hours}h</p>
                          <div>
                            <div className="text-cp-yellow">Total: ₹{booking.total_amount || 0}</div>
                            <div className="text-xs">
                              Paid: ₹{booking.amount_paid || 0}
                              <div className="text-gray-300">
                                Remaining: ₹{(booking.total_amount || 0) - (booking.amount_paid || 0)}
                              </div>
                              <div className="mt-1">
                                Status: <span className={`px-1 py-0.5 rounded text-xs ${
                                  (booking.amount_paid || 0) === 0 ? 'bg-red-500/20 text-red-400' :
                                  (booking.amount_paid || 0) >= (booking.total_amount || 0) ? 'bg-green-500/20 text-green-400' : 
                                  'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  {(booking.amount_paid || 0) === 0 ? 'Pending' :
                                   (booking.amount_paid || 0) >= (booking.total_amount || 0) ? 'Full' : 'Partial'}
                                </span>
                              </div>
                              {editingPayment === booking.id ? (
                                <div className="flex gap-1 mt-1">
                                  <input
                                    type="number"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                    className="w-20 px-1 py-0.5 text-xs bg-gray-800 rounded text-white"
                                    placeholder="Amount"
                                  />
                                  <button
                                    onClick={() => handleUpdatePayment(booking.id, Number(paymentAmount))}
                                    className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingPayment(booking.id)
                                    setPaymentAmount(booking.amount_paid?.toString() || '0')
                                  }}
                                  className="ml-1 text-xs text-cp-cyan hover:underline"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div>
                          <span className={`px-2 py-1 rounded text-xs text-white ${getStatusColor(booking.status)}`}>
                            {booking.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => setViewingBooking(booking)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                        >
                          View
                        </button>
                        <button
                          onClick={() => setEditingBooking(booking)}
                          className="bg-cp-cyan text-cp-black px-3 py-1 rounded text-sm hover:bg-cp-yellow"
                        >
                          Edit
                        </button>
                        {booking.status !== 'CANCELLED' && (
                          <button
                            onClick={() => setDeletingBooking(booking)}
                            className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              {/* Pagination Controls for Active Bookings */}
              {activeTotal > itemsPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <div className="text-gray-400 text-sm">
                    Page {activePage} of {Math.ceil(activeTotal / itemsPerPage)}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActivePage(p => Math.max(1, p - 1))}
                      disabled={activePage === 1}
                      className="px-3 py-1 bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-500"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setActivePage(p => p + 1)}
                      disabled={activePage >= Math.ceil(activeTotal / itemsPerPage)}
                      className="px-3 py-1 bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-500"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cancelled Bookings */}
            {showCancelled && (
              <div className="space-y-4 mt-8">
                <h2 className="text-xl font-bold text-red-400">Cancelled Bookings</h2>
                {filteredCancelled.map((booking: any) => (
                                      <div key={booking.id} className="bg-red-900/20 border border-red-500/20 rounded-lg p-6">
                      <div className="flex justify-between items-start">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1">
                          <div>
                            <h3 className="text-red-300 font-bold">{booking.stations?.name || 'Unknown Station'}</h3>
                            <p className="text-gray-300 text-sm">{booking.stations?.type}</p>
                          </div>
                          <div>
                            <p className="text-white"><strong>User:</strong> {booking.user_profiles?.username || 'Unknown'}</p>
                            <p className="text-gray-300 text-sm">{booking.user_profiles?.full_name || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-white"><strong>Created:</strong> {formatDate(booking.created_at)}</p>
                            <p className="text-white"><strong>Play Date:</strong> {formatDate(booking.start_at)}</p>
                            <p className="text-white"><strong>Time:</strong> {formatTime(booking.start_time)} - {formatTime(booking.end_time)}</p>
                          </div>
                          <div>
                            <p className="text-white"><strong>Duration:</strong> {booking.duration_hours}h</p>
                            <p className="text-white"><strong>Amount:</strong> ₹{booking.total_amount}</p>
                          </div>
                          <div>
                            <span className="px-2 py-1 rounded text-xs text-white bg-red-600">
                              CANCELLED
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => setViewingBooking(booking)}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                          >
                            View
                          </button>
                        </div>
                    </div>
                  </div>
                ))}
                
                {/* Pagination Controls for Cancelled Bookings */}
                {cancelledTotal > itemsPerPage && (
                  <div className="flex justify-between items-center mt-4">
                    <div className="text-gray-400 text-sm">
                      Page {cancelledPage} of {Math.ceil(cancelledTotal / itemsPerPage)}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCancelledPage(p => Math.max(1, p - 1))}
                        disabled={cancelledPage === 1}
                        className="px-3 py-1 bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-500"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setCancelledPage(p => p + 1)}
                        disabled={cancelledPage >= Math.ceil(cancelledTotal / itemsPerPage)}
                        className="px-3 py-1 bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-500"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            </>
            ) : (
            <div className="flex gap-4">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {loading ? (
                  <div className="text-center text-cp-cyan col-span-full">Loading stations...</div>
                ) : (
                  stationsData.filter((sd: any) => sd.station.id !== null).map((stationData) => {
                  const station = stationData.station
                  const reservations = stationData.reservations || []
                  const status = getStationStatus(stationData)
                  
                  return (
                    <div
                      key={station.id || 'unassigned'}
                      className={`border rounded-lg p-4 ${
                        status === 'occupied' ? 'bg-red-900/20 border-red-500/50' :
                        status === 'pending' ? 'bg-yellow-900/20 border-yellow-500/50' :
                        'bg-green-900/20 border-green-500/50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-cp-yellow font-bold text-lg">{station.name}</h3>
                          <p className="text-gray-300 text-sm">{station.type}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            status === 'occupied' ? 'bg-red-500' :
                            status === 'pending' ? 'bg-yellow-500' :
                            'bg-green-500'
                          } text-white`}>
                            {status === 'occupied' ? 'OCCUPIED' : status === 'pending' ? 'PENDING' : 'AVAILABLE'}
                          </span>
                          <div className="relative menu-container">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenStationMenuId(openStationMenuId === station.id ? null : station.id)
                              }}
                              className="text-gray-400 hover:text-white px-2 py-1 text-lg"
                              title="Station Options"
                            >
                              ☰
                            </button>
                            {openStationMenuId === station.id && (
                              <div className="absolute left-0 top-8 bg-cp-gray border border-cp-cyan/30 rounded shadow-lg z-10 min-w-[150px]">
                                {reservations.length > 0 ? (
                                  reservations.map((reservation: any) => (
                                    <div key={reservation.id}>
                                      <button
                                        onClick={() => {
                                          setViewingBooking(reservation)
                                          setOpenStationMenuId(null)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                      >
                                        View {reservation.user_profiles?.username || 'Booking'}
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingBooking(reservation)
                                          setOpenStationMenuId(null)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                      >
                                        Edit {reservation.user_profiles?.username || 'Booking'}
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                  <p className="px-3 py-2 text-sm text-gray-400">No bookings</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {reservations.length === 0 ? (
                          <p className="text-gray-400 text-sm">No reservations</p>
                        ) : (
                          reservations.map((reservation: any) => (
                            <div key={reservation.id} className="bg-cp-black/30 rounded p-2 text-sm">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <p className="text-white font-medium">
                                    {reservation.user_profiles?.username || reservation.user_profiles?.full_name || 'Unknown'}
                                  </p>
                                  <p className="text-gray-400 text-xs">
                                    {reservation.duration_hours}h • ₹{reservation.total_amount || 0}
                                  </p>
                                  {reservation.checked_in_at && (
                                    <>
                                      <p className="text-green-400 text-xs mt-1">✓ Checked In</p>
                                      <div className="mt-2 space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-cp-yellow text-xs font-mono">
                                            Elapsed: {formatTimer(reservation)}
                                          </span>
                                          {reservation.timer_started_at ? (
                                            <button
                                              onClick={() => handleStopTimer(reservation.id)}
                                              className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                                            >
                                              Stop
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => handleStartTimer(reservation.id)}
                                              className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                                            >
                                              Start
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs font-mono ${
                                            formatRemainingTimer(reservation).includes('Grace:') ? 'text-red-500 font-bold animate-pulse' : 
                                            formatRemainingTimer(reservation) === 'EXTENDING...' ? 'text-yellow-500 font-bold' :
                                            'text-red-400'
                                          }`}>
                                            Remaining: {formatRemainingTimer(reservation)}
                                          </span>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <div className="relative menu-container">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setOpenMenuId(openMenuId === reservation.id ? null : reservation.id)
                                    }}
                                    className="text-gray-400 hover:text-white px-2 py-1 text-xl"
                                    title="Options"
                                  >
                                    ⋮
                                  </button>
                                  {openMenuId === reservation.id && (
                                    <div className="absolute left-0 top-8 bg-cp-gray border border-cp-cyan/30 rounded shadow-lg z-10 min-w-[120px]">
                                      <button
                                        onClick={() => {
                                          setViewingBooking(reservation)
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                      >
                                        View
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingBooking(reservation)
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => {
                                          setAdvanceBookingId(reservation.id)
                                          setAdvanceTotalAmount(reservation.total_amount || 0)
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                      >
                                        Advance Posting
                                      </button>
                                      {!reservation.checked_in_at && station.id && (
                                        <button
                                          onClick={() => {
                                            handleCheckin(reservation.id, station.id)
                                            setOpenMenuId(null)
                                          }}
                                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                        >
                                          Check In
                                        </button>
                                      )}
                                      {reservation.checked_in_at && (
                                        <button
                                          onClick={() => {
                                            setCheckoutBookingId(reservation.id)
                                            setCheckoutRemainingAmount(reservation.remaining_amount || 0)
                                            setOpenMenuId(null)
                                          }}
                                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                        >
                                          Checkout
                                        </button>
                                      )}
                                      {(reservation.checked_in_at || reservation.status === 'ENDED') && (
                                        <button
                                          onClick={() => {
                                            handleGenerateReceipt(reservation.id)
                                            setOpenMenuId(null)
                                          }}
                                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                        >
                                          Generate Receipt
                                        </button>
                                      )}
                                      <button
                                        onClick={() => {
                                          setDeletingBooking(reservation)
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-600 hover:text-white"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )
                  })
                )}
              </div>
              
              {/* Reservations Sidebar */}
              <div className="w-80 bg-cp-gray/20 border border-cp-cyan/30 rounded-lg p-4 h-fit max-h-[calc(100vh-200px)] overflow-y-auto">
                <h3 className="text-cp-yellow font-bold text-lg mb-4">Reservations</h3>
                {(() => {
                  const allReservations = stationsData.flatMap((sd: any) => sd.reservations || [])
                    .filter((reservation: any) => !reservation.checked_in_at)
                  return allReservations.length === 0 ? (
                    <p className="text-gray-400 text-sm">No reservations</p>
                  ) : (
                    <div className="space-y-3">
                      {allReservations.map((reservation: any) => {
                        const assignedStation = stationsData.find((sd: any) => 
                          sd.reservations?.some((r: any) => r.id === reservation.id) && sd.station.id !== null
                        )?.station
                        const isUnassigned = !assignedStation
                        
                        return (
                          <div key={reservation.id} className="bg-cp-black/30 rounded p-3 text-sm">
                            <div className="mb-2">
                              <p className="text-white font-medium">
                                {reservation.user_profiles?.username || reservation.user_profiles?.full_name || 'Unknown'}
                              </p>
                              <p className="text-gray-400 text-xs">
                                {reservation.duration_hours}h • ₹{reservation.total_amount || 0}
                              </p>
                              {assignedStation && (
                                <p className="text-gray-300 text-xs mt-1">Station: {assignedStation.name}</p>
                              )}
                              {reservation.checked_in_at && (
                                <>
                                  <p className="text-green-400 text-xs mt-1">✓ Checked In</p>
                                  <div className="mt-2 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-cp-yellow text-xs font-mono">
                                        Elapsed: {formatTimer(reservation)}
                                      </span>
                                      {reservation.timer_started_at ? (
                                        <button
                                          onClick={() => handleStopTimer(reservation.id)}
                                          className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                                        >
                                          Stop
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => handleStartTimer(reservation.id)}
                                          className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                                        >
                                          Start
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-mono ${
                                        formatRemainingTimer(reservation).includes('Grace:') ? 'text-red-500 font-bold animate-pulse' : 
                                        formatRemainingTimer(reservation) === 'EXTENDING...' ? 'text-yellow-500 font-bold' :
                                        'text-red-400'
                                      }`}>
                                        Remaining: {formatRemainingTimer(reservation)}
                                      </span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                            {isUnassigned && !reservation.checked_in_at && (
                              <select
                                value={selectedStations[reservation.id] || ''}
                                onChange={(e) => setSelectedStations({...selectedStations, [reservation.id]: e.target.value})}
                                className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-2 py-1 text-white text-xs mb-2"
                              >
                                <option value="">Select Station</option>
                                {stationsData.filter((sd: any) => sd.station.id !== null).map((sd: any) => (
                                  <option key={sd.station.id} value={sd.station.id}>
                                    {sd.station.name} ({sd.station.type})
                                  </option>
                                ))}
                              </select>
                            )}
                            <div className="flex gap-1">
                              {isUnassigned && !reservation.checked_in_at && selectedStations[reservation.id] && (
                                <button
                                  onClick={() => {
                                    handleCheckin(reservation.id, selectedStations[reservation.id])
                                    setSelectedStations({...selectedStations, [reservation.id]: ''})
                                  }}
                                  className="flex-1 bg-cp-cyan text-cp-black px-2 py-1 rounded text-xs hover:bg-cp-yellow"
                                >
                                  Check In
                                </button>
                              )}
                              {!isUnassigned && !reservation.checked_in_at && (
                                <button
                                  onClick={() => handleCheckin(reservation.id, assignedStation.id)}
                                  className="flex-1 bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                                >
                                  Check In
                                </button>
                              )}
                              <div className="relative menu-container">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMenuId(openMenuId === reservation.id ? null : reservation.id)
                                  }}
                                  className="text-gray-400 hover:text-white px-2 py-1 text-xl"
                                >
                                  ⋮
                                </button>
                                {openMenuId === reservation.id && (
                                  <div className="absolute left-0 top-8 bg-cp-gray border border-cp-cyan/30 rounded shadow-lg z-10 min-w-[120px]">
                                    <button
                                      onClick={() => {
                                        setViewingBooking(reservation)
                                        setOpenMenuId(null)
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                    >
                                      View
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingBooking(reservation)
                                        setOpenMenuId(null)
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => {
                                        setAdvanceBookingId(reservation.id)
                                        setAdvanceTotalAmount(reservation.total_amount || 0)
                                        setOpenMenuId(null)
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                    >
                                      Advance Posting
                                    </button>
                                    {reservation.checked_in_at && (
                                      <button
                                        onClick={() => {
                                          setCheckoutBookingId(reservation.id)
                                          setCheckoutRemainingAmount(reservation.remaining_amount || 0)
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                      >
                                        Checkout
                                      </button>
                                    )}
                                    {(reservation.checked_in_at || reservation.status === 'ENDED') && (
                                      <button
                                        onClick={() => {
                                          handleGenerateReceipt(reservation.id)
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cp-cyan hover:text-cp-black"
                                      >
                                        Generate Receipt
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setDeletingBooking(reservation)
                                        setOpenMenuId(null)
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-600 hover:text-white"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
            )}
          </div>
        </main>

        {/* Edit Modal */}
        {editingBooking && (
          <BookingModal
            booking={editingBooking}
            onSave={handleSave}
            onClose={() => setEditingBooking(null)}
          />
        )}

        {/* Delete Modal */}
        {deletingBooking && (
          <DeleteModal
            booking={deletingBooking}
            onConfirm={() => handleCancel(deletingBooking.id)}
            onClose={() => setDeletingBooking(null)}
          />
        )}

        {/* View Modal */}
        {viewingBooking && (
          <ViewModal
            booking={viewingBooking}
            onClose={() => setViewingBooking(null)}
          />
        )}

        {/* Checkout Modal */}
        {checkoutBookingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 w-80">
              <h3 className="text-cp-yellow font-bold mb-4">Checkout</h3>
              {checkoutRemainingAmount > 0 ? (
                <>
                  <label className="block text-sm text-gray-300 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white mb-4"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="BANK">Bank Transfer</option>
                  </select>
                  <label className="block text-sm text-gray-300 mb-1">Payment Status</label>
                  <select
                    value={checkoutPaid ? 'PAID' : 'PENDING'}
                    onChange={(e) => setCheckoutPaid(e.target.value === 'PAID')}
                    className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white mb-4"
                  >
                    <option value="PAID">Paid</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </>
              ) : (
                <p className="text-green-400 mb-4">Already paid in full. Click Confirm to checkout.</p>
              )}
              <div className="flex gap-2">
                <button onClick={handleCheckout} className="bg-cp-cyan text-cp-black px-4 py-2 rounded">Confirm</button>
                <button onClick={() => setCheckoutBookingId(null)} className="bg-gray-600 text-white px-4 py-2 rounded">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Advance Posting Modal */}
        {advanceBookingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 w-80">
              <h3 className="text-cp-yellow font-bold mb-4">Advance Posting</h3>
              <p className="text-sm text-gray-300 mb-3">Total Amount: ₹{advanceTotalAmount}</p>
              <label className="block text-sm text-gray-300 mb-1">Advance Amount</label>
              <input
                type="number"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white mb-4"
              />
              <label className="block text-sm text-gray-300 mb-1">Payment Method</label>
              <select
                value={advancePaymentMethod}
                onChange={(e) => setAdvancePaymentMethod(e.target.value)}
                className="w-full bg-cp-black/50 border border-cp-cyan/30 rounded px-3 py-2 text-white mb-4"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK">Bank Transfer</option>
              </select>
              <div className="flex gap-2">
                <button onClick={handleAdvancePosting} className="bg-cp-cyan text-cp-black px-4 py-2 rounded">Confirm</button>
                <button onClick={() => setAdvanceBookingId(null)} className="bg-gray-600 text-white px-4 py-2 rounded">Cancel</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AdminGuard>
  )
} 