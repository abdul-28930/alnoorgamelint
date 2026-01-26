'use client'

interface DateBookingsModalProps {
  isOpen: boolean
  onClose: () => void
  date: string
  stationBookings: any
}

export function DateBookingsModal({ isOpen, onClose, date, stationBookings }: DateBookingsModalProps) {
  if (!isOpen) return null
  
  const formatTime = (timeString: string) => {
    // For datetime fields (start_at/end_at), convert to IST
    return new Date(timeString).toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'Asia/Kolkata'
    })
  }
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'UPCOMING': return 'bg-blue-500/20 text-blue-400'
      case 'ONGOING': return 'bg-green-500/20 text-green-400'
      case 'ENDED': return 'bg-gray-500/20 text-gray-400'
      case 'CANCELLED': return 'bg-red-500/20 text-red-400'
      default: return 'bg-yellow-500/20 text-yellow-400'
    }
  }
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  
  const getTotalStats = () => {
    let totalBookings = 0
    let totalRevenue = 0
    
    Object.values(stationBookings).forEach((bookings: any) => {
      totalBookings += bookings.length
      totalRevenue += bookings.reduce((sum: number, booking: any) => sum + (booking.total_amount || 0), 0)
    })
    
    return { totalBookings, totalRevenue }
  }
  
  const stats = getTotalStats()
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-cp-gray border border-cp-cyan/30 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-cp-yellow font-bold text-xl">
            📅 {formatDate(date)} - Booking Details
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        
        {/* Summary Stats */}
        <div className="bg-cp-black/30 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-cp-cyan">{stats.totalBookings}</div>
              <div className="text-sm text-gray-400">Total Bookings</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-cp-yellow">₹{stats.totalRevenue}</div>
              <div className="text-sm text-gray-400">Total Revenue</div>
            </div>
          </div>
        </div>
        
        {/* Station Bookings */}
        {Object.keys(stationBookings).length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-gray-400">No bookings found for this date</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(stationBookings).map(([stationName, bookings]: [string, any]) => (
              <div key={stationName} className="bg-cp-black/20 rounded-lg p-4">
                <h4 className="text-cp-cyan font-bold text-lg mb-4">
                  {bookings[0]?.stations?.type === 'PS5' ? '🎮' : '💻'} {stationName}
                </h4>
                
                <div className="space-y-2">
                  {bookings.map((booking: any) => (
                    <div key={booking.id} className="flex items-center justify-between bg-cp-gray/30 rounded p-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-4">
                          <div className="text-white font-semibold">
                            {formatTime(booking.start_at)} - {formatTime(booking.end_at)}
                          </div>
                          <span className={`px-2 py-1 rounded text-xs ${getStatusColor(booking.status)}`}>
                            {booking.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-300 mt-1">
                          {booking.user_profiles?.username || 'Unknown User'} 
                          {booking.user_profiles?.full_name && ` (${booking.user_profiles.full_name})`}
                        </div>
                      </div>
                      <div className="text-cp-yellow font-bold">
                        ₹{booking.total_amount || 0}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-3 text-sm text-gray-400">
                  {bookings.length} booking{bookings.length !== 1 ? 's' : ''} • 
                  ₹{bookings.reduce((sum: number, b: any) => sum + (b.total_amount || 0), 0)} revenue
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 