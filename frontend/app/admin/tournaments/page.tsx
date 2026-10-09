'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminGuard } from '@/components/ui/admin-guard'
import { api, STATUS_STYLE, type TournamentRow } from '@/lib/tournaments'

const blank = {
  name: '', game: '', platform: 'PC', tournament_type: 'knockout', max_players: 8, team_size: 1, best_of: 1,
  third_place_match: false, double_round_robin: false, seeding: 'random', entry_fee: 0, prize_pool: 0,
  prize_details: '', rules: '', description: '', starts_at: '', registration_closes_at: '',
}

const input = 'w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white'

export default function AdminTournamentsPage() {
  const [rows, setRows] = useState<TournamentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ ...blank })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows(await api.list())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // live counts: refresh every 10 s
  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  const set = (k: keyof typeof blank, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const create = async () => {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { ...form }
      for (const k of ['starts_at', 'registration_closes_at', 'prize_details', 'rules'] as const) if (!body[k]) delete body[k]
      await api.create(body)
      setCreating(false)
      setForm({ ...blank })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const isKo = form.tournament_type === 'knockout'

  return (
    <AdminGuard>
      <div className="min-h-screen bg-black p-6 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold">Tournaments</h1>
            <button onClick={() => setCreating((v) => !v)} className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400">
              {creating ? 'Close' : '+ New tournament'}
            </button>
          </div>

          {error && <div className="mb-6 rounded-lg border border-red-600 bg-red-900/50 p-4 text-red-300">{error}</div>}

          {creating && (
            <div className="mb-8 rounded-lg bg-gray-900 p-6">
              <h2 className="mb-4 text-xl font-bold">Create tournament</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="md:col-span-2">Name<input className={input} value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
                <label>Game<input className={input} value={form.game} onChange={(e) => set('game', e.target.value)} /></label>
                <label>Platform
                  <select className={input} value={form.platform} onChange={(e) => set('platform', e.target.value)}>
                    {['PC', 'PS5', 'PS4', 'Xbox', 'Switch', 'Mobile'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label>Format
                  <select className={input} value={form.tournament_type} onChange={(e) => set('tournament_type', e.target.value)}>
                    <option value="knockout">Single elimination</option>
                    <option value="league">Round robin</option>
                  </select>
                </label>
                <label>Max {form.team_size > 1 ? 'teams' : 'players'}<input type="number" min={2} className={input} value={form.max_players} onChange={(e) => set('max_players', Number(e.target.value))} /></label>
                <label>Team size (1 = solo)<input type="number" min={1} max={10} className={input} value={form.team_size} onChange={(e) => set('team_size', Number(e.target.value))} /></label>
                <label>Best of
                  <select className={input} value={form.best_of} onChange={(e) => set('best_of', Number(e.target.value))}>
                    {[1, 3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label>Seeding
                  <select className={input} value={form.seeding} onChange={(e) => set('seeding', e.target.value)}>
                    <option value="random">Random</option>
                    <option value="manual">Manual (staff order)</option>
                  </select>
                </label>
                <label>Entry fee (₹, shown only)<input type="number" min={0} className={input} value={form.entry_fee} onChange={(e) => set('entry_fee', Number(e.target.value))} /></label>
                <label>Prize pool (₹)<input type="number" min={0} className={input} value={form.prize_pool} onChange={(e) => set('prize_pool', Number(e.target.value))} /></label>
                <label>Starts (IST)<input type="datetime-local" className={input} value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></label>
                <label>Registration closes (IST)<input type="datetime-local" className={input} value={form.registration_closes_at} onChange={(e) => set('registration_closes_at', e.target.value)} /></label>
                {isKo ? (
                  <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={form.third_place_match} onChange={(e) => set('third_place_match', e.target.checked)} />Third-place match</label>
                ) : (
                  <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={form.double_round_robin} onChange={(e) => set('double_round_robin', e.target.checked)} />Home and away (play twice)</label>
                )}
                <label className="md:col-span-3">Description<textarea rows={2} className={input} value={form.description} onChange={(e) => set('description', e.target.value)} /></label>
                <label className="md:col-span-3">Prize details<input className={input} value={form.prize_details} onChange={(e) => set('prize_details', e.target.value)} /></label>
                <label className="md:col-span-3">Rules<textarea rows={3} className={input} value={form.rules} onChange={(e) => set('rules', e.target.value)} /></label>
              </div>
              <button disabled={busy || !form.name || !form.game} onClick={create} className="mt-4 rounded bg-green-600 px-5 py-2 font-semibold disabled:opacity-50">
                {busy ? 'Creating…' : 'Create as draft'}
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-gray-400">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-gray-400">No tournaments yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((t) => (
                <Link key={t.id} href={`/admin/tournaments/${t.id}`} className="block rounded-lg border border-gray-800 bg-gray-900 p-5 transition hover:border-cyan-500">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold">{t.name}</h2>
                    <span className={`rounded px-2 py-0.5 text-xs uppercase ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                  </div>
                  <p className="text-sm text-gray-400">{t.game} · {t.platform} · {t.tournament_type === 'knockout' ? 'Single elimination' : 'Round robin'}{t.team_size > 1 ? ` · teams of ${t.team_size}` : ''}</p>
                  <div className="mt-4 grid grid-cols-3 text-center">
                    <div><div className="text-2xl font-bold text-cyan-400">{t.registered_count}/{t.max_players}</div><div className="text-xs text-gray-400">registered</div></div>
                    <div><div className="text-2xl font-bold text-yellow-400">{t.waitlist_count}</div><div className="text-xs text-gray-400">waitlist</div></div>
                    <div><div className="text-2xl font-bold text-purple-400">{t.view_count}</div><div className="text-xs text-gray-400">views</div></div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  )
}
