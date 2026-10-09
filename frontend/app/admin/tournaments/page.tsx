'use client'

import { useState, useEffect } from 'react'
import { AdminGuard } from '@/components/ui/admin-guard'
import { apiFetch } from '@/lib/api'


export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    game: '',
    platform: 'PC',
    max_players: 8,
    tournament_type: 'knockout',
    description: ''
  })

  useEffect(() => {
    fetchTournaments()
  }, [])

  const fetchTournaments = async () => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).auth.getSession()
      const token = session?.access_token
      
      if (!token) return
      
      const response = await apiFetch(`/api/v1/admin/tournaments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setTournaments(Array.isArray(data) ? data : [])
        setError(null)
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to fetch tournaments')
      }
    } catch (error) {
      console.error('Failed to fetch tournaments:', error)
    } finally {
      setLoading(false)
    }
  }

  const createTournament = async () => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).auth.getSession()
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/tournaments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })
      
      if (response.ok) {
        setShowCreateForm(false)
        setFormData({ name: '', game: '', platform: 'PC', max_players: 8, tournament_type: 'knockout', description: '' })
        setError(null)
        fetchTournaments()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to create tournament')
      }
    } catch (error) {
      console.error('Failed to create tournament:', error)
    }
  }

  const updateStatus = async (tournamentId: string, status: string) => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).auth.getSession()
      const token = session?.access_token
      
      const response = await apiFetch(`/api/v1/admin/tournaments/${tournamentId}/status?status=${status}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        setError(null)
        fetchTournaments()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to update status')
      }
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-black text-white">
        
        <main className="p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold">Tournament Management</h1>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-cyan-500 text-black px-4 py-2 rounded hover:bg-yellow-400"
              >
                Create Tournament
              </button>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-600 rounded-lg p-4 mb-6">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {/* Create Form */}
            {showCreateForm && (
              <div className="bg-gray-900 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-bold mb-4">Create Tournament</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Tournament Name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-2"
                  />
                  <input
                    type="text"
                    placeholder="Game"
                    value={formData.game}
                    onChange={(e) => setFormData({...formData, game: e.target.value})}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-2"
                  />
                  <select
                    title="Platform"
                    value={formData.platform}
                    onChange={(e) => setFormData({...formData, platform: e.target.value})}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="PC">PC</option>
                    <option value="PS5">PS5</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Max Players"
                    value={formData.max_players}
                    onChange={(e) => setFormData({...formData, max_players: parseInt(e.target.value)})}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-2"
                  />
                  <select
                    title="Tournament Type"
                    value={formData.tournament_type}
                    onChange={(e) => setFormData({...formData, tournament_type: e.target.value})}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="knockout">Knockout</option>
                    <option value="league">League</option>
                  </select>
                  <textarea
                    placeholder="Description"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-2 md:col-span-2"
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={createTournament} className="bg-green-600 text-white px-4 py-2 rounded">Create</button>
                  <button onClick={() => setShowCreateForm(false)} className="bg-gray-600 text-white px-4 py-2 rounded">Cancel</button>
                </div>
              </div>
            )}

            {/* Tournament List */}
            {loading ? (
              <div className="text-center py-8">Loading tournaments...</div>
            ) : (
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Game</th>
                      <th className="px-4 py-3 text-left">Platform</th>
                      <th className="px-4 py-3 text-left">Players</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournaments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                          No tournaments found. Create your first tournament!
                        </td>
                      </tr>
                    ) : (
                      tournaments.map((tournament: any) => (
                        <tr key={tournament.id} className="border-b border-gray-700">
                          <td className="px-4 py-3 font-semibold">{tournament.name}</td>
                          <td className="px-4 py-3">{tournament.game}</td>
                          <td className="px-4 py-3">{tournament.platform}</td>
                          <td className="px-4 py-3">{tournament.max_players}</td>
                          <td className="px-4 py-3">{tournament.tournament_type}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              tournament.status === 'open' ? 'bg-green-600' :
                              tournament.status === 'draft' ? 'bg-gray-600' :
                              tournament.status === 'paused' ? 'bg-yellow-600' :
                              'bg-blue-600'
                            }`}>
                              {tournament.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              title="Update Status"
                              value={tournament.status}
                              onChange={(e) => updateStatus(tournament.id, e.target.value)}
                              className="bg-gray-700 text-white text-xs px-2 py-1 rounded"
                            >
                              <option value="draft">Draft</option>
                              <option value="open">Open</option>
                              <option value="paused">Paused</option>
                              <option value="active">Active</option>
                              <option value="completed">Completed</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
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