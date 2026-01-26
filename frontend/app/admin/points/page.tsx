'use client'

import { useState, useEffect } from 'react'
import { NavBar } from '@/components/ui/navbar'
import { AdminGuard } from '@/components/ui/admin-guard'
import { AdminNavBar } from '@/components/ui/admin-navbar'

export default function AdminPoints() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTransactions()
  }, [])

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('accessToken')
      const response = await fetch('/api/v1/admin/points/transactions', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setTransactions(data)
      }
    } catch (error) {
      console.error('Error loading transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const formatPoints = (points: number) => {
    return points > 0 ? `+${points}` : points.toString()
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
                Points <span className="text-cp-cyan">Transactions</span>
              </h1>
              <p className="text-gray-300 mt-2">View all points transactions</p>
            </div>

            <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg overflow-hidden">
              {loading ? (
                <div className="p-6 text-center text-cp-cyan">Loading transactions...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-cp-cyan/10 border-b border-cp-cyan/20">
                      <tr>
                        <th className="px-4 py-3 text-left text-cp-yellow font-bold">Username</th>
                        <th className="px-4 py-3 text-left text-cp-yellow font-bold">Type</th>
                        <th className="px-4 py-3 text-left text-cp-yellow font-bold">Points</th>
                        <th className="px-4 py-3 text-left text-cp-yellow font-bold">Description</th>
                        <th className="px-4 py-3 text-left text-cp-yellow font-bold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-cp-cyan/10 hover:bg-cp-cyan/5">
                          <td className="px-4 py-3 text-white font-semibold">
                            {transaction.user_profiles?.username || 'Unknown'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              transaction.transaction_type === 'earned' 
                                ? 'bg-green-600 text-white' 
                                : 'bg-red-600 text-white'
                            }`}>
                              {transaction.transaction_type}
                            </span>
                          </td>
                          <td className={`px-4 py-3 font-bold ${
                            transaction.points_amount > 0 ? 'text-cp-cyan' : 'text-red-400'
                          }`}>
                            {formatPoints(transaction.points_amount)}
                          </td>
                          <td className="px-4 py-3 text-gray-300">
                            {transaction.description}
                          </td>
                          <td className="px-4 py-3 text-gray-400">
                            {formatDate(transaction.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {transactions.length === 0 && !loading && (
              <div className="text-center text-gray-400 py-12">
                <p>No transactions found</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </AdminGuard>
  )
} 