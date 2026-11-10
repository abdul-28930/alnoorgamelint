'use client'

import { useState } from 'react'
import { toIstInput, type TournamentRow } from '@/lib/tournaments'

const input = 'w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white'

/** Name, game, dates, size and prizes of an existing tournament. Only what was changed is sent. */
export function EditDetails({ t, started, busy, onSave }: { t: TournamentRow; started: boolean; busy: boolean; onSave: (changes: Record<string, unknown>) => void }) {
  const initial = {
    name: t.name, game: t.game, platform: t.platform, max_players: t.max_players, entry_fee: t.entry_fee, prize_pool: t.prize_pool,
    starts_at: toIstInput(t.starts_at), ends_at: toIstInput(t.ends_at), registration_closes_at: toIstInput(t.registration_closes_at),
    prize_details: t.prize_details ?? '', description: t.description ?? '',
  }
  const [f, setF] = useState(initial)
  const set = (k: keyof typeof initial, v: string | number) => setF((x) => ({ ...x, [k]: v }))
  const changed = (Object.keys(initial) as (keyof typeof initial)[]).filter((k) => f[k] !== initial[k])

  const save = () => {
    const body: Record<string, unknown> = {}
    changed.forEach((k) => {
      const v = f[k]
      body[k] = ['starts_at', 'ends_at', 'registration_closes_at', 'prize_details', 'description'].includes(k) && v === '' ? null : v
    })
    if (body.description === null) body.description = ''
    onSave(body)
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Name<input className={input} value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="text-sm">Game<input className={input} value={f.game} onChange={(e) => set('game', e.target.value)} /></label>
        <label className="text-sm">Starts (IST)<input type="datetime-local" className={input} value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></label>
        <label className="text-sm">Expected to end around (IST)<input type="datetime-local" className={input} value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></label>
        <label className="text-sm">Registration closes (IST)<input type="datetime-local" className={input} value={f.registration_closes_at} onChange={(e) => set('registration_closes_at', e.target.value)} /></label>
        <label className="text-sm">Platform
          <select className={input} value={f.platform} onChange={(e) => set('platform', e.target.value)}>
            <option value="PC">PC</option>
            <option value="PS5">PS5</option>
          </select>
        </label>
        <label className="text-sm">Max {t.team_size > 1 ? 'teams' : 'players'}{started ? ' (locked once the bracket exists)' : ''}
          <input type="number" min={2} max={256} disabled={started} className={`${input} disabled:opacity-50`} value={f.max_players} onChange={(e) => set('max_players', Number(e.target.value))} />
        </label>
        <label className="text-sm">Entry fee (₹, shown only)<input type="number" min={0} className={input} value={f.entry_fee} onChange={(e) => set('entry_fee', Number(e.target.value))} /></label>
        <label className="text-sm">Prize pool (₹)<input type="number" min={0} className={input} value={f.prize_pool} onChange={(e) => set('prize_pool', Number(e.target.value))} /></label>
        <label className="text-sm md:col-span-2">Prize details<input className={input} value={f.prize_details} onChange={(e) => set('prize_details', e.target.value)} /></label>
        <label className="text-sm md:col-span-2">Description<textarea rows={3} className={input} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
      </div>
      <p className="text-xs text-gray-400">Players who already registered are not messaged about a change. Use "Send WhatsApp notification" to tell them.</p>
      <button disabled={busy || changed.length === 0} className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" onClick={save}>Save changes</button>
    </div>
  )
}
