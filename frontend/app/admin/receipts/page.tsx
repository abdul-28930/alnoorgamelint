'use client'

import { useState, useEffect } from 'react'
import { NavBar } from '@/components/ui/navbar'
import { AdminGuard } from '@/components/ui/admin-guard'
import { AdminNavBar } from '@/components/ui/admin-navbar'
import { bookings, admin } from '@/lib/supabase'

export default function AdminReceipts() {
  const [receiptBookings, setReceiptBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const itemsPerPage = 20
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadReceiptBookings()
  }, [page])

  const loadReceiptBookings = async () => {
    setLoading(true)
    try {
      const result = await bookings.getAllBookings(page, itemsPerPage * 2)
      
      const filtered = (result.data || []).filter((booking: any) => 
        booking.checked_in_at || booking.status === 'ENDED'
      )
      
      setReceiptBookings(filtered)
      setTotal(filtered.length)
    } catch (error) {
      console.error('Error loading receipts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewReceipt = async (bookingId: string) => {
    try {
      const { error } = await admin.generateReceipt(bookingId)
      if (error) {
        alert('Failed to generate receipt: ' + error.message)
      }
    } catch (error) {
      alert('Failed to generate receipt')
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString()
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A'
    return timeString.slice(0, 5) // Already IST from database
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-cp-black">
        <NavBar />
        
        <div className="mt-20">
          <AdminNavBar />
        </div>
        
        <main className="pt-6 pb-12 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-cp-yellow">
                Receipts <span className="text-cp-cyan">Management</span>
              </h1>
              <p className="text-gray-300 mt-2">View and generate receipts for checked-in and ended bookings</p>
            </div>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by Booking ID, User, or Station..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-md bg-cp-gray/40 border border-cp-cyan/30 rounded px-4 py-2 text-white placeholder-gray-400"
              />
            </div>

            {loading ? (
              <div className="text-center text-cp-cyan">Loading receipts...</div>
            ) : receiptBookings.length === 0 ? (
              <div className="text-center text-gray-400">No receipts available</div>
            ) : (
              <div className="bg-cp-gray/20 border border-cp-cyan/30 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-cp-gray/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-cp-yellow font-bold">Booking ID</th>
                      <th className="px-4 py-3 text-left text-cp-yellow font-bold">User</th>
                      <th className="px-4 py-3 text-left text-cp-yellow font-bold">Station</th>
                      <th className="px-4 py-3 text-left text-cp-yellow font-bold">Date</th>
                      <th className="px-4 py-3 text-left text-cp-yellow font-bold">Status</th>
                      <th className="px-4 py-3 text-left text-cp-yellow font-bold">Total Amount</th>
                      <th className="px-4 py-3 text-left text-cp-yellow font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptBookings.filter((booking: any) => {
                      const search = searchTerm.toLowerCase()
                      return !search || 
                        booking.id.toLowerCase().includes(search) ||
                        (booking.user_profiles?.username || '').toLowerCase().includes(search) ||
                        (booking.stations?.name || '').toLowerCase().includes(search)
                    }).map((booking: any) => (
                      <tr key={booking.id} className="border-t border-cp-cyan/20 hover:bg-cp-gray/10">
                        <td className="px-4 py-3 text-white text-sm">{booking.id.slice(0, 8)}...</td>
                        <td className="px-4 py-3 text-white text-sm">
                          {booking.user_profiles?.username || booking.user_profiles?.full_name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-white text-sm">
                          {booking.stations?.name || 'N/A'} ({booking.stations?.type || 'N/A'})
                        </td>
                        <td className="px-4 py-3 text-white text-sm">
                          {formatDate(booking.start_at)} {booking.start_time ? formatTime(booking.start_time) : ''}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs ${
                            booking.status === 'ENDED' ? 'bg-gray-600' : 'bg-green-600'
                          } text-white`}>
                            {booking.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-cp-yellow font-semibold">₹{booking.total_amount || 0}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleViewReceipt(booking.id)}
                            className="bg-cp-cyan text-cp-black px-3 py-1 rounded text-sm hover:bg-cp-yellow font-medium"
                          >
                            View Receipt
                          </button>
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


