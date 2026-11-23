'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { NavBar } from '@/components/ui/navbar'
import { Footer } from '@/components/ui/footer'
import { auth } from '@/lib/supabase'
import { clock12, gta, hoursLabel, inr, istLabel, todayIst, type GtaPackage, type GtaPass, type GtaSettings, type GtaSlot } from '@/lib/gta'

const btn = 'rounded px-4 py-2 font-semibold transition disabled:opacity-50'

/** The day's start times for a visit of this length; free ones can be picked. */
function SlotPicker({ date, minutes, value, onChange }: { date: string; minutes: number; value: string | null; onChange: (start: string | null) => void }) {
  const [slots, setSlots] = useState<GtaSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setSlots(null)
    setError(null)
    gta.availability(date, minutes).then((r) => live && setSlots(r.slots)).catch((e) => live && setError((e as Error).message))
    return () => { live = false }
  }, [date, minutes])
  if (error) return <p className="text-red-400">{error}</p>
  if (!slots) return <p className="text-gray-400">Loading free times…</p>
  const free = slots.filter((s) => s.free).length
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {slots.map((s) => (
          <button key={s.start} type="button" disabled={!s.free} onClick={() => onChange(value === s.start ? null : s.start)}
            className={`rounded border px-2 py-2 text-sm ${value === s.start ? 'border-cp-cyan bg-cp-cyan text-black' : s.free ? 'border-cp-cyan/40 bg-cp-black/40 text-white hover:border-cp-cyan' : 'cursor-not-allowed border-gray-700 bg-gray-900 text-gray-600 line-through'}`}>
            {clock12(s.start)}
          </button>
        ))}
      </div>
      {free === 0 && <p className="mt-2 text-sm text-yellow-300">Nothing is free that day for this length of time. Try another day.</p>}
    </div>
  )
}

function PassCard({ pass, settings, onChanged }: { pass: GtaPass; settings: GtaSettings; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayIst())
  const maxH = Math.min(settings.max_visit_hours, Math.floor((pass.unbooked_minutes ?? 0) / 60))
  const [hours, setHours] = useState(1)
  const [start, setStart] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const pct = Math.min(100, Math.round((pass.used_minutes / pass.total_minutes) * 100))
  const canBook = pass.status === 'ACTIVE' && (pass.unbooked_minutes ?? 0) >= 60 && pass.hours > settings.block_max_hours

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); setStart(null); await onChanged() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-lg border border-cp-cyan/30 bg-cp-gray/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xl font-bold text-cp-yellow">{pass.package_name} <span className="text-sm font-normal text-gray-400">· {pass.hours} h · {pass.players === 2 ? 'Duo' : 'Solo'} · {inr(pass.price)}</span></div>
          <div className="text-sm text-gray-400">Bought {istLabel(pass.created_at.slice(0, 19).replace('T', ' '))}{pass.includes ? ` · includes ${pass.includes}` : ''}</div>
        </div>
        <div className="text-right text-sm">
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${pass.status === 'ACTIVE' ? 'bg-green-600/30 text-green-300' : 'bg-gray-600/40 text-gray-300'}`}>{pass.status}</span>
          <div className={`mt-1 ${pass.payment_status === 'PAID' ? 'text-green-300' : 'text-yellow-300'}`}>{pass.payment_status === 'PAID' ? 'Paid' : pass.payment_status === 'PARTIAL' ? `Paid ${inr(pass.amount_paid)}` : 'Pay at the café'}</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-sm text-gray-300"><span>Played {hoursLabel(pass.used_minutes)}</span><span>{pass.remaining_minutes >= 0 ? `${hoursLabel(pass.remaining_minutes)} left` : hoursLabel(pass.remaining_minutes)}</span></div>
        <div className="h-2 overflow-hidden rounded bg-gray-800"><div className="h-full bg-cp-cyan" style={{ width: `${pct}%` }} /></div>
      </div>

      {(pass.visits ?? []).filter((v) => v.status !== 'CANCELLED').length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {(pass.visits ?? []).filter((v) => v.status !== 'CANCELLED').map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-black/30 px-3 py-2">
              <span>{istLabel(v.start_at)} · {hoursLabel(v.duration_minutes)}{v.status === 'ENDED' ? ` · played ${hoursLabel(v.minutes_counted)}` : ''}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{v.status === 'ONGOING' ? 'Playing now' : v.status.toLowerCase()}</span>
                {v.status === 'UPCOMING' && <button disabled={busy} className="rounded bg-red-900 px-2 py-1 text-xs text-white" onClick={() => { if (confirm('Cancel this visit?')) run(() => gta.cancelVisit(v.id), 'Visit cancelled.') }}>Cancel</button>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canBook && (
        <div className="mt-4">
          <button className={`${btn} bg-cp-cyan text-black`} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Book a visit'}</button>
          {open && (
            <div className="mt-3 space-y-3 rounded bg-black/30 p-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label>Day <input type="date" min={todayIst()} value={date} onChange={(e) => { setDate(e.target.value); setStart(null) }} className="ml-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white" /></label>
                <label>Hours <select value={hours} onChange={(e) => { setHours(Number(e.target.value)); setStart(null) }} className="ml-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white">
                  {Array.from({ length: Math.max(1, maxH) }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
                </select></label>
                <span className="text-gray-400">{hoursLabel(pass.unbooked_minutes ?? 0)} still to book</span>
              </div>
              <SlotPicker date={date} minutes={hours * 60} value={start} onChange={setStart} />
              <button disabled={busy || !start} className={`${btn} bg-green-600 text-white`} onClick={() => run(() => gta.bookVisit(pass.id, `${date} ${start}:00`, hours * 60), 'Visit booked.')}>
                {start ? `Book ${clock12(start)} for ${hours} h` : 'Choose a time'}
              </button>
            </div>
          )}
        </div>
      )}
      {pass.status === 'ACTIVE' && pass.hours > settings.block_max_hours && (pass.unbooked_minutes ?? 0) === 0 && pass.remaining_minutes > 0 && <p className="mt-3 text-sm text-gray-400">All your remaining time is already booked.</p>}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>}
    </div>
  )
}

export default function GtaPage() {
  const [data, setData] = useState<{ settings: GtaSettings; packages: GtaPackage[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<1 | 2>(1)
  const [picked, setPicked] = useState<GtaPackage | null>(null)
  const [date, setDate] = useState(todayIst())
  const [start, setStart] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string } | null | undefined>(undefined)
  const [passes, setPasses] = useState<GtaPass[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadPasses = useCallback(async () => { try { setPasses(await gta.my()) } catch { setPasses([]) } }, [])
  useEffect(() => {
    gta.catalog().then(setData).catch((e) => setError((e as Error).message))
    auth.getSession().then(({ data: s }) => { const u = s.session?.user ?? null; setUser(u); if (u) loadPasses() })
  }, [loadPasses])

  const shown = useMemo(() => (data?.packages ?? []).filter((p) => p.players === tab), [data, tab])
  const isBlock = !!picked && !!data && picked.hours <= data.settings.block_max_hours

  const buy = async () => {
    if (!picked) return
    setBusy(true)
    setMsg(null)
    try {
      await gta.buy(picked.id, isBlock ? `${date} ${start}:00` : undefined)
      setMsg({ ok: true, text: isBlock ? `Booked ${picked.name} for ${istLabel(`${date} ${start}:00`)}. Pay at the café; staff confirm your payment.` : `${picked.name} bought. Book your visits below, any time that suits you.` })
      setPicked(null)
      setStart(null)
      await loadPasses()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-cp-black text-white">
      <NavBar />
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-28">
        <h1 className="text-4xl font-bold text-cp-yellow md:text-5xl">GTA <span className="text-cp-cyan">VI</span> packages</h1>
        <p className="mt-2 text-gray-300">Play GTA VI on our dedicated PS5. Every package includes food. Open {data ? `${clock12(data.settings.open_time)} to ${clock12(data.settings.close_time)}` : '9 AM to 11:30 PM'}.</p>
        {error && <p className="mt-4 rounded border border-red-600 bg-red-900/40 p-3 text-red-300">{error}</p>}

        <div className="mt-6 flex gap-2">
          {([[1, 'Solo'], [2, 'Duo (2 players, 1 PS5, 1 controller)']] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setPicked(null); setStart(null) }} className={`${btn} ${tab === k ? 'bg-cp-cyan text-black' : 'bg-gray-700 text-white'}`}>{label}</button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <button key={p.id} onClick={() => { setPicked(p); setStart(null); setMsg(null) }}
              className={`relative rounded-lg border p-4 text-left transition ${picked?.id === p.id ? 'border-cp-yellow bg-cp-yellow/10' : 'border-cp-cyan/30 bg-cp-gray/20 hover:border-cp-cyan'}`}>
              {p.badge && <span className="absolute right-3 top-3 rounded bg-cp-yellow px-2 py-0.5 text-xs font-bold text-black">★ {p.badge}</span>}
              <div className="text-lg font-bold">{p.name}</div>
              <div className="text-sm text-gray-400">{p.hours} hour{p.hours > 1 ? 's' : ''}{data && p.hours > data.settings.block_max_hours ? ' · use over several visits' : ' · one session'}</div>
              <div className="mt-2 text-2xl font-bold text-cp-cyan">{inr(p.price)}</div>
              {p.includes && <div className="mt-1 text-xs text-gray-400">Includes {p.includes}</div>}
            </button>
          ))}
        </div>

        {picked && data && (
          <section className="mt-6 rounded-lg border border-cp-yellow/40 bg-cp-gray/20 p-5">
            <h2 className="text-xl font-bold text-cp-yellow">{picked.name} · {picked.hours} h · {inr(picked.price)}</h2>
            {user === null ? (
              <p className="mt-3">Please <Link className="text-cp-cyan underline" href={`/auth?next=${encodeURIComponent('/gta')}`}>log in</Link> to book.</p>
            ) : isBlock ? (
              <div className="mt-3 space-y-3">
                <label className="text-sm">Day <input type="date" min={todayIst()} value={date} onChange={(e) => { setDate(e.target.value); setStart(null) }} className="ml-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white" /></label>
                <SlotPicker date={date} minutes={picked.hours * 60} value={start} onChange={setStart} />
                <button disabled={busy || !start} className={`${btn} bg-green-600 text-white`} onClick={buy}>{start ? `Book ${clock12(start)} · ${inr(picked.price)}` : 'Choose a time'}</button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-gray-300">This is {picked.hours} hours of play to use over several visits. Buy it now, then book each visit on the slot grid. We keep track of the time you play.</p>
                <button disabled={busy} className={`${btn} bg-green-600 text-white`} onClick={buy}>Buy {picked.name} · {inr(picked.price)}</button>
              </div>
            )}
          </section>
        )}
        {msg && <p className={`mt-4 rounded border p-3 ${msg.ok ? 'border-green-600 bg-green-900/30 text-green-300' : 'border-red-600 bg-red-900/40 text-red-300'}`}>{msg.text}</p>}

        <p className="mt-6 text-sm text-gray-400">Need more hours? Buy another package as an add-on. There is no per-hour extension. Pay at the café; staff confirm your payment.</p>

        {user && data && (
          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-bold text-cp-yellow">My GTA VI packages</h2>
            {passes.length === 0 ? <p className="text-gray-400">You have not bought a package yet.</p> : (
              <div className="space-y-4">{passes.map((p) => <PassCard key={p.id} pass={p} settings={data.settings} onChanged={loadPasses} />)}</div>
            )}
          </section>
        )}
      </main>
      <Footer />
    </div>
  )
}
