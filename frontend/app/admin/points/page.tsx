'use client'

import { useState, useEffect } from 'react'
import { AdminGuard } from '@/components/ui/admin-guard'
import { apiFetch, apiError } from '@/lib/api'
import { MemberSearch, type Member } from '@/components/admin/member-search'

export default function AdminPoints() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [member, setMember] = useState<Member | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // the picked member's current balance, so staff see what they are changing
  useEffect(() => {
    setBalance(null)
    if (!member) return
    apiFetch(`/api/v1/admin/points/balance?user_id=${member.user_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBalance(d ? Number(d.balance) : null))
      .catch(() => setBalance(null))
  }, [member])

  const points = Math.floor(Number(amount))
  const canApply = !!member && Number.isFinite(points) && points > 0 && reason.trim().length >= 3 && !busy

  const apply = async () => {
    if (!member) return
    const change = mode === 'add' ? points : -points
    if (!confirm(`${mode === 'add' ? 'Add' : 'Remove'} ${points} points ${mode === 'add' ? 'to' : 'from'} ${member.full_name || member.username}?\nReason: ${reason.trim()}`)) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/v1/admin/points/adjust', { method: 'POST', body: JSON.stringify({ user_id: member.user_id, points: change, reason: reason.trim() }) })
      if (!res.ok) throw new Error(await apiError(res, 'Could not change the points'))
      const d = await res.json()
      setBalance(Number(d.balance))
      setMessage({ ok: true, text: `Done. ${member.full_name || member.username} now has ${d.balance} points (was ${d.previous}).` })
      setAmount('')
      setReason('')
      loadTransactions()
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadTransactions()
  }, [])

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const response = await apiFetch('/api/v1/admin/points/transactions')
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
        
        
        <main className="pt-6 pb-12 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-cp-yellow">
                Points <span className="text-cp-cyan">Transactions</span>
              </h1>
              <p className="text-gray-300 mt-2">Add or remove a member's points, and see every points transaction</p>
            </div>

            <div className="mb-8 rounded-lg border border-cp-cyan/20 bg-cp-gray/20 p-5">
              <h2 className="mb-3 text-xl font-bold text-cp-yellow">Add or remove points</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm text-gray-300">Member (username, name, email or phone)</div>
                  <MemberSearch value={member} onChange={setMember} />
                  {member && <p className="mt-2 text-sm text-gray-300">Current balance: <b className="text-cp-cyan">{balance === null ? '…' : `${balance} points`}</b></p>}
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(['add', 'remove'] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded px-3 py-2 text-sm font-medium ${mode === m ? (m === 'add' ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'bg-gray-600 text-white'}`}>
                        {m === 'add' ? 'Add points' : 'Remove points'}
                      </button>
                    ))}
                  </div>
                  <input type="number" min={1} inputMode="numeric" placeholder="Number of points" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-cp-cyan/30 bg-cp-black/50 px-3 py-2 text-white" />
                  <input placeholder="Reason (required, kept in the history)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className="w-full rounded border border-cp-cyan/30 bg-cp-black/50 px-3 py-2 text-white" />
                  <button disabled={!canApply} onClick={apply} className="rounded bg-cp-cyan px-4 py-2 font-semibold text-cp-black disabled:opacity-50">{busy ? 'Saving…' : 'Apply'}</button>
                </div>
              </div>
              {message && <p className={`mt-3 text-sm ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>}
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
                              transaction.type === 'earned' 
                                ? 'bg-green-600 text-white' 
                                : 'bg-red-600 text-white'
                            }`}>
                              {transaction.type}
                            </span>
                          </td>
                          <td className={`px-4 py-3 font-bold ${
                            transaction.points > 0 ? 'text-cp-cyan' : 'text-red-400'
                          }`}>
                            {formatPoints(transaction.points)}
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