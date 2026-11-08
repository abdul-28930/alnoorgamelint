'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api, slotParts, type DaysInfo, type RankedPlayer, type TournamentRow } from '@/lib/tournaments'

const ICON: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

/** Top 5: winner, runner-up, third place winner and loser, then the best of the rest by goals. Fills in as results are entered. */
export function FinalRanking({ rows, title = 'Final standings' }: { rows: RankedPlayer[]; title?: string }) {
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-900/10 p-4">
      <h3 className="mb-2 font-bold text-yellow-300">{title}</h3>
      <ol className="space-y-1">
        {rows.map((r) => (
          <li key={r.entrant_id} className="flex items-center gap-3">
            <span className="w-8 text-center text-lg">{ICON[r.place] ?? r.place}</span>
            <span className="font-semibold">{r.display_name ?? '—'}</span>
            <span className="text-xs text-gray-400">{r.reason}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The days of a tournament played over several days, with their counts and winners. `base` is '/admin/tournaments' or '/tournaments'. */
export function DaysBar({ info, currentId, base, publicView = false }: { info: DaysInfo; currentId: string; base: string; publicView?: boolean }) {
  return (
    <div className="mb-6 rounded-lg bg-gray-900 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-300">
        {info.parent ? <>Part of <Link className="text-cyan-400 underline" href={`${base}/${info.parent.id}`}>{info.parent.name}</Link></> : <b>This tournament is played over {info.days.length} days. Each day has its own players, waitlist and bracket.</b>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {info.days.map((d) => {
          const when = slotParts(d.starts_at)
          return (
            <div key={d.id} className={`rounded-lg border p-3 ${d.id === currentId ? 'border-cyan-500 bg-cyan-900/20' : 'border-gray-700'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Day {d.day_no}{when ? <span className="font-normal text-gray-400"> · {when.day}, {when.time}</span> : null}</div>
                <span className="text-xs uppercase text-gray-400">{d.status}</span>
              </div>
              <div className="mt-1 text-sm text-gray-300">{d.registered_count}/{d.max_players} players{d.waitlist_count ? ` · ${d.waitlist_count} waiting` : ''}</div>
              {d.champion_name && <div className="mt-1 text-sm text-yellow-300">🏆 Winner: {d.champion_name}</div>}
              {d.id !== currentId && (publicView && d.status === 'draft'
                ? <div className="mt-2 text-sm text-gray-400">Not open yet</div>
                : <Link className="mt-2 inline-block rounded bg-cyan-700 px-3 py-1 text-sm text-white" href={`${base}/${d.id}`}>Open day {d.day_no}</Link>)}
              {!publicView && d.status === 'draft' && <div className="mt-1 text-xs text-yellow-300">Draft: players cannot see this day until you open it.</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Admin: divide the registered players (and the waitlist) into days. Shows the result before anything changes. */
export function SplitPanel({ t, onDone }: { t: TournamentRow; onDone: () => Promise<void> }) {
  const [method, setMethod] = useState<'first' | 'alternate' | 'random'>('first')
  const [days, setDays] = useState(2)
  const [capacity, setCapacity] = useState(String(Math.ceil(t.max_players / 2)))
  const [preview, setPreview] = useState<{ day: number; players: number; waitlist: number }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cap = Math.max(2, Math.floor(Number(capacity) || 0))

  const go = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="mt-4 space-y-3 text-sm">
      <p className="text-gray-300">Divide the {t.registered_count} registered players{t.waitlist_count ? ` and ${t.waitlist_count} on the waitlist` : ''} between days. Each day becomes its own tournament with its own bracket, schedule and standings.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>Number of days
          <select className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5" value={days} onChange={(e) => { setDays(Number(e.target.value)); setCapacity(String(Math.ceil(t.max_players / Number(e.target.value)))); setPreview(null) }}>
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>Players per day
          <input type="number" min={2} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5" value={capacity} onChange={(e) => { setCapacity(e.target.value); setPreview(null) }} />
        </label>
        <label>How to divide
          <select className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5" value={method} onChange={(e) => { setMethod(e.target.value as typeof method); setPreview(null) }}>
            <option value="first">First registered play on day 1, next on day 2…</option>
            <option value="alternate">Alternate: 1st day 1, 2nd day 2, 3rd day 1…</option>
            <option value="random">Random draw</option>
          </select>
        </label>
      </div>
      {preview && (
        <div className="rounded bg-gray-800 p-3">
          {preview.map((p) => <div key={p.day}>Day {p.day}: <b>{p.players}</b> players{p.waitlist ? `, ${p.waitlist} on its waitlist` : ''}</div>)}
          {method === 'random' && <p className="mt-1 text-xs text-gray-400">The random draw is made again when you split, so the names will differ from any preview. The counts stay the same.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} className="rounded bg-gray-700 px-3 py-1.5 text-white" onClick={() => go(async () => setPreview((await api.splitPreview(t.id, method, cap)).days))}>Preview the split</button>
        <button disabled={busy || !preview} className="rounded bg-green-600 px-3 py-1.5 font-medium text-white disabled:opacity-50" onClick={() => {
          if (!confirm(`Split into ${days} days?\n\nThe players are moved to the day tournaments. After this you can still move any player to another day by hand, until the brackets are generated.`)) return
          go(async () => { await api.split(t.id, method, cap); await onDone() })
        }}>Split into {days} days</button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
    </div>
  )
}
