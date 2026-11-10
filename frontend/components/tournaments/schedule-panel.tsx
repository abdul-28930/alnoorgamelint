'use client'

import { useEffect, useState } from 'react'
import { api, slotParts, type Match, type ScheduleSettings, type TournamentRow } from '@/lib/tournaments'

const input = 'rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-white'

/** Every scheduled match in time order, grouped by day then kick-off time; shared by the public page and the admin page. */
export function ScheduleList({ matches, highlightDone = true }: { matches: Match[]; highlightDone?: boolean }) {
  const rows = matches
    .filter((m) => m.scheduled_at && m.status !== 'bye')
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)) || (a.console_no ?? 0) - (b.console_no ?? 0))
  if (!rows.length) return <p className="text-gray-400">The match times have not been set yet.</p>

  const days: { day: string; slots: { time: string; matches: Match[] }[] }[] = []
  for (const m of rows) {
    const p = slotParts(m.scheduled_at)!
    let day = days.find((d) => d.day === p.day)
    if (!day) days.push((day = { day: p.day, slots: [] }))
    let slot = day.slots.find((s) => s.time === p.time)
    if (!slot) day.slots.push((slot = { time: p.time, matches: [] }))
    slot.matches.push(m)
  }
  return (
    <div className="space-y-6">
      {days.map((d) => (
        <div key={d.day}>
          <h3 className="mb-2 font-semibold text-cyan-400">{d.day}</h3>
          <div className="space-y-2">
            {d.slots.map((s) => (
              <div key={s.time} className="flex flex-wrap gap-3 rounded-lg bg-gray-900/70 p-3 md:flex-nowrap">
                <div className="w-20 shrink-0 text-lg font-bold tabular-nums text-yellow-300">{s.time}</div>
                <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {s.matches.map((m) => {
                    const done = m.status === 'completed'
                    return (
                      <div key={m.id} className={`rounded border px-2 py-1.5 text-sm ${m.status === 'live' ? 'border-red-500' : 'border-gray-700'} ${done && highlightDone ? 'opacity-70' : ''}`}>
                        <div className="mb-0.5 flex justify-between text-[11px] uppercase tracking-wide text-gray-400">
                          <span>{m.console_no ? `PS5 ${m.console_no}` : ''}</span>
                          <span>{m.bracket === 'third' ? 'Third place' : m.round_name}</span>
                        </div>
                        <div className="truncate">{m.entrant1_name ?? <i className="text-gray-500">TBD</i>} <span className="text-gray-500">vs</span> {m.entrant2_name ?? <i className="text-gray-500">TBD</i>}</div>
                        {done && m.score1 !== null && <div className="text-xs text-green-300">{m.score1} - {m.score2}</div>}
                        {m.status === 'live' && <div className="text-xs font-bold text-red-400">● LIVE</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function defaultSchedule(t: TournamentRow): ScheduleSettings {
  const ist = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 330 * 60 * 1000) : null)
  const start = ist(t.starts_at) ?? new Date(Date.now() + 330 * 60 * 1000)
  const end = ist(t.ends_at)
  const d1 = start.toISOString().slice(0, 10)
  const d2 = new Date(start.getTime() + 86_400_000).toISOString().slice(0, 10)
  const from = t.starts_at ? start.toISOString().slice(11, 16) : '11:00'
  const to = end && end.toISOString().slice(0, 10) === d1 ? end.toISOString().slice(11, 16) : '18:00'
  return {
    consoles: 4, match_minutes: 3, buffer_minutes: 1,
    // a day of a tournament played over days is one day; otherwise a weekend by default
    days: t.parent_id ? [{ date: d1, start: from, end: to }] : [{ date: d1, start: from, end: to }, { date: d2, start: from, end: to }],
    breaks: [{ start: '13:30', end: '14:30', label: 'Lunch' }],
  }
}

/** The match-time settings: consoles, match length, buffer, each day's hours and breaks (lunch...). Used before and after the bracket exists. */
export function ScheduleFields({ cfg, set, toPlay }: { cfg: ScheduleSettings; set: (patch: Partial<ScheduleSettings>) => void; toPlay: number }) {
  const slot = cfg.match_minutes + cfg.buffer_minutes
  const slotsNeeded = Math.ceil(toPlay / Math.max(1, cfg.consoles))
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(v) || min)))
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>Consoles (PS5)<input type="number" className={`${input} mt-1 w-full`} value={cfg.consoles} onChange={(e) => set({ consoles: num(e.target.value, 1, 20) })} /></label>
        <label>Match length (minutes)<input type="number" className={`${input} mt-1 w-full`} value={cfg.match_minutes} onChange={(e) => set({ match_minutes: num(e.target.value, 1, 120) })} /></label>
        <label>Buffer between matches (minutes)<input type="number" className={`${input} mt-1 w-full`} value={cfg.buffer_minutes} onChange={(e) => set({ buffer_minutes: num(e.target.value, 0, 60) })} /></label>
      </div>
      <p className="text-gray-400">A new set of {cfg.consoles} matches starts every {slot} minute{slot === 1 ? '' : 's'}. {toPlay} match{toPlay === 1 ? '' : 'es'} still to play ≈ {slotsNeeded} slot{slotsNeeded === 1 ? '' : 's'} ≈ {slotsNeeded * slot} minutes of play, before breaks.</p>

      <div>
        <div className="mb-1 font-semibold text-gray-200">Days (start and end time)</div>
        <div className="space-y-2">
          {cfg.days.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input type="date" className={input} value={d.date} onChange={(e) => set({ days: cfg.days.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
              <input type="time" className={input} value={d.start} onChange={(e) => set({ days: cfg.days.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
              <span>to</span>
              <input type="time" className={input} value={d.end} onChange={(e) => set({ days: cfg.days.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
              {cfg.days.length > 1 && <button type="button" className="rounded bg-red-900 px-2 py-1" onClick={() => set({ days: cfg.days.filter((_, j) => j !== i) })}>✕</button>}
            </div>
          ))}
          <button type="button" className="rounded bg-gray-700 px-3 py-1" onClick={() => {
            const last = cfg.days[cfg.days.length - 1]
            const next = new Date(new Date(`${last.date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
            set({ days: [...cfg.days, { date: next, start: last.start, end: last.end }] })
          }}>+ Add a day</button>
        </div>
      </div>

      <div>
        <div className="mb-1 font-semibold text-gray-200">Breaks (lunch, prayer…) <span className="font-normal text-gray-400">leave the date empty to apply to every day</span></div>
        <div className="space-y-2">
          {cfg.breaks.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className={`${input} w-28`} placeholder="Label" value={b.label ?? ''} onChange={(e) => set({ breaks: cfg.breaks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <select className={input} value={b.date ?? ''} onChange={(e) => set({ breaks: cfg.breaks.map((x, j) => (j === i ? { ...x, date: e.target.value || undefined } : x)) })}>
                <option value="">Every day</option>
                {cfg.days.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
              </select>
              <input type="time" className={input} value={b.start} onChange={(e) => set({ breaks: cfg.breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
              <span>to</span>
              <input type="time" className={input} value={b.end} onChange={(e) => set({ breaks: cfg.breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
              <button type="button" className="rounded bg-red-900 px-2 py-1" onClick={() => set({ breaks: cfg.breaks.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="rounded bg-gray-700 px-3 py-1" onClick={() => set({ breaks: [...cfg.breaks, { start: '13:30', end: '14:30', label: 'Break' }] })}>+ Add a break</button>
        </div>
      </div>

    </div>
  )
}

/** Admin: set consoles, match length, buffer, opening hours and breaks, then plan (or re-plan from now). */
export function SchedulePanel({ t, matches, onChanged }: { t: TournamentRow; matches: Match[]; onChanged: () => Promise<void> }) {
  const [s, setS] = useState<ScheduleSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // what was saved last time, else sensible defaults
  useEffect(() => {
    let live = true
    api.scheduleSettings(t.id).then((r) => live && setS(r.settings ?? defaultSchedule(t))).catch(() => live && setS(defaultSchedule(t)))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id])
  const cfg = s ?? defaultSchedule(t)
  const set = (patch: Partial<ScheduleSettings>) => setS({ ...cfg, ...patch })
  const toPlay = matches.filter((m) => !['bye', 'completed'].includes(m.status)).length

  const plan = async (replan: boolean) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await api.planSchedule(t.id, cfg, replan)
      setMsg({ ok: r.unscheduled === 0, text: r.unscheduled ? `${r.scheduled} matches planned, but ${r.unscheduled} do not fit in the days and hours you set. Add a day or longer hours and plan again.` : `Done: ${r.scheduled} matches planned${r.first ? `, from ${r.first.slice(11)} on ${r.first.slice(0, 10)} to ${r.last?.slice(11)} on ${r.last?.slice(0, 10)}` : ''}.` })
      await onChanged()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 space-y-4 text-sm">
      <ScheduleFields cfg={cfg} set={set} toPlay={toPlay} />

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy || matches.length === 0} className="rounded bg-green-600 px-3 py-1.5 font-medium text-white disabled:opacity-50" onClick={() => plan(false)}>Plan the schedule</button>
        <button disabled={busy || matches.length === 0} className="rounded bg-yellow-700 px-3 py-1.5 font-medium text-white disabled:opacity-50" title="Gives every match still to be played a new time, starting now" onClick={() => { if (confirm('Re-plan all matches still to be played, starting from now?')) plan(true) }}>Re-plan from now</button>
        {matches.length === 0 && <span className="text-gray-400">Generate the bracket first.</span>}
      </div>
      {msg && <p className={msg.ok ? 'text-green-400' : 'text-red-400'}>{msg.text}</p>}
    </div>
  )
}
