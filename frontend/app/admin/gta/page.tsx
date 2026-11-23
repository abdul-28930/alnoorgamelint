'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminGuard } from '@/components/ui/admin-guard'
import { clock12, gta, gtaAdmin, hoursLabel, inr, istLabel, todayIst, type GtaPackage, type GtaPass, type GtaSettings, type GtaVisit } from '@/lib/gta'

const btn = 'rounded px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50'
const input = 'rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white'

function useAction() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => Promise<void> | void) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); await after?.() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  return { msg, busy, run }
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  return m ? <p className={`my-2 rounded border p-2 text-sm ${m.ok ? 'border-green-600 text-green-300' : 'border-red-600 text-red-300'}`}>{m.text}</p> : null
}

function Walkin({ packages, onDone }: { packages: GtaPackage[]; onDone: () => Promise<void> }) {
  const [pkg, setPkg] = useState('')
  const [who, setWho] = useState<'guest' | 'member'>('guest')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [startAt, setStartAt] = useState('')
  const { msg, busy, run } = useAction()
  const sel = packages.find((p) => p.id === pkg)
  return (
    <div className="mb-6 rounded-lg border border-cp-cyan/30 bg-cp-gray/20 p-4">
      <h3 className="mb-2 font-bold text-cp-yellow">Walk-in / sell a package</h3>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <select className={input} value={pkg} onChange={(e) => setPkg(e.target.value)}>
          <option value="">Package…</option>
          {packages.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.players === 2 ? 'Duo' : 'Solo'} · {p.name} · {p.hours} h · {inr(p.price)}</option>)}
        </select>
        <select className={input} value={who} onChange={(e) => setWho(e.target.value as 'guest' | 'member')}><option value="guest">Guest</option><option value="member">Member (username)</option></select>
        {who === 'guest' ? (<><input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /><input className={input} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></>)
          : <input className={input} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />}
        <label className="text-gray-300">Start (blank = now) <input className={input} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
        <button disabled={busy || !pkg || (who === 'guest' ? !name.trim() : !username.trim())} className={`${btn} bg-green-600 text-white`}
          onClick={() => run(() => gtaAdmin.walkin({ package_id: pkg, ...(who === 'guest' ? { guest_name: name.trim(), ...(phone.trim() ? { guest_phone: phone.trim() } : {}) } : { username: username.trim() }), ...(startAt ? { start_at: `${startAt.replace('T', ' ')}:00` } : {}) }),
            sel && sel.hours <= 5 ? 'Booked and timer started.' : 'Package sold. Book visits from the Passes tab.', onDone)}>Sell</button>
      </div>
      <Msg m={msg} />
    </div>
  )
}

function Schedule({ packages }: { packages: GtaPackage[] }) {
  const [date, setDate] = useState(todayIst())
  const [visits, setVisits] = useState<GtaVisit[]>([])
  const [settings, setSettings] = useState<GtaSettings | null>(null)
  const { msg, busy, run } = useAction()
  const load = useCallback(async () => { const r = await gtaAdmin.schedule(date); setVisits(r.visits); setSettings(r.settings) }, [date])
  useEffect(() => { load().catch(() => {}) }, [load])
  useEffect(() => { const t = setInterval(() => load().catch(() => {}), 30000); return () => clearInterval(t) }, [load])
  return (
    <div>
      <Walkin packages={packages} onDone={load} />
      <div className="mb-3 flex items-center gap-3 text-sm text-gray-300">
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        {settings && <span>Open {clock12(settings.open_time)} – {clock12(settings.close_time)} · 1 PS5</span>}
        <button className={`${btn} bg-gray-700 text-white`} onClick={() => load()}>Refresh</button>
      </div>
      <Msg m={msg} />
      {visits.length === 0 ? <p className="text-gray-400">No visits on this day.</p> : (
        <ul className="space-y-2">
          {visits.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-cp-cyan/20 bg-cp-gray/20 p-3">
              <div>
                <div className="font-semibold">{clock12(v.start_at.slice(11, 16))} – {clock12(v.end_at.slice(11, 16))} <span className="text-gray-400">({hoursLabel(v.duration_minutes)})</span></div>
                <div className="text-sm text-gray-300">{v.pass?.customer ?? 'Customer'}{v.pass?.customer_phone ? ` · ${v.pass.customer_phone}` : ''} · {v.pass?.package_name} {v.pass?.players === 2 ? '(Duo)' : '(Solo)'}</div>
                {v.pass && <div className="text-xs text-gray-400">{v.pass.payment_status}{v.pass.food_served ? ' · food served' : ' · food pending'}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${v.status === 'ONGOING' ? 'bg-green-600/30 text-green-300' : 'bg-gray-700 text-gray-200'}`}>{v.status}{v.status === 'ENDED' ? ` · ${hoursLabel(v.minutes_counted)}` : ''}</span>
                {v.status === 'UPCOMING' && <button disabled={busy} className={`${btn} bg-green-600 text-white`} onClick={() => run(() => gtaAdmin.visit(v.id, 'start'), 'Timer started.', load)}>Start</button>}
                {v.status === 'ONGOING' && <button disabled={busy} className={`${btn} bg-orange-600 text-white`} onClick={() => run(() => gtaAdmin.visit(v.id, 'stop'), 'Timer stopped.', load)}>Stop</button>}
                {(v.status === 'UPCOMING' || v.status === 'ONGOING') && <button disabled={busy} className={`${btn} bg-red-900 text-white`} onClick={() => { if (confirm('Cancel this visit?')) run(() => gtaAdmin.visit(v.id, 'cancel'), 'Visit cancelled.', load) }}>Cancel</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PassRow({ pass, packages, onChanged }: { pass: GtaPass; packages: GtaPackage[]; onChanged: () => Promise<void> }) {
  const { msg, busy, run } = useAction()
  const [amount, setAmount] = useState(String(pass.price))
  const [method, setMethod] = useState('cash')
  const [date, setDate] = useState(todayIst())
  const [startAt, setStartAt] = useState('')
  const [hours, setHours] = useState(1)
  const [addon, setAddon] = useState('')
  const [open, setOpen] = useState(false)
  const overtime = pass.remaining_minutes < 0
  return (
    <div className="rounded border border-cp-cyan/20 bg-cp-gray/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-bold text-cp-yellow">{pass.customer} <span className="text-sm font-normal text-gray-400">{pass.customer_phone ?? ''}</span></div>
          <div className="text-sm text-gray-300">{pass.package_name} · {pass.hours} h · {pass.players === 2 ? 'Duo' : 'Solo'} · {inr(pass.price)}</div>
          <div className={`text-sm ${overtime ? 'text-red-300' : 'text-gray-300'}`}>Played {hoursLabel(pass.used_minutes)} · {hoursLabel(pass.remaining_minutes)}{overtime ? '' : ' left'}</div>
        </div>
        <div className="text-right text-sm">
          <div>{pass.status}</div>
          <div className={pass.payment_status === 'PAID' ? 'text-green-300' : 'text-yellow-300'}>{pass.payment_status} {inr(pass.amount_paid)} / {inr(pass.price)}</div>
          <label className="mt-1 flex items-center justify-end gap-1 text-gray-300"><input type="checkbox" checked={pass.food_served} onChange={(e) => run(() => gtaAdmin.food(pass.id, e.target.checked), 'Updated.', onChanged)} /> Food served</label>
        </div>
      </div>
      <button className={`${btn} mt-2 bg-gray-700 text-white`} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Manage'}</button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-300">Payment received:</span>
            <input className={`${input} w-24`} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}><option>cash</option><option>upi</option><option>card</option></select>
            <button disabled={busy} className={`${btn} bg-green-600 text-white`} onClick={() => run(() => gtaAdmin.pay(pass.id, Number(amount), method), 'Payment saved.', onChanged)}>Save</button>
          </div>
          {pass.status === 'ACTIVE' && pass.hours > 5 && (pass.unbooked_minutes ?? 0) >= 60 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-300">Book visit:</span>
              <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className={input} type="time" step={3600} value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              <select className={input} value={hours} onChange={(e) => setHours(Number(e.target.value))}>{Array.from({ length: Math.min(8, Math.floor((pass.unbooked_minutes ?? 0) / 60)) }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h} h</option>)}</select>
              <button disabled={busy || !startAt} className={`${btn} bg-cp-cyan text-black`} onClick={() => run(() => gtaAdmin.bookVisit(pass.id, `${date} ${startAt}:00`, hours * 60), 'Visit booked.', onChanged)}>Book</button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-300">Extra hours (add-on package):</span>
            <select className={input} value={addon} onChange={(e) => setAddon(e.target.value)}>
              <option value="">Package…</option>
              {packages.filter((p) => p.active && p.players === pass.players).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.hours} h · {inr(p.price)}</option>)}
            </select>
            <button disabled={busy || !addon} className={`${btn} bg-cp-cyan text-black`} onClick={() => {
              const p = packages.find((x) => x.id === addon)
              const short = !!p && p.hours <= 5
              if (short && !startAt) { alert('Pick a start time above for a short package.'); return }
              run(() => gtaAdmin.addOn(pass.id, addon, short ? `${date} ${startAt}:00` : undefined), 'Add-on package sold.', onChanged)
            }}>Sell add-on</button>
          </div>
          {(pass.visits ?? []).length > 0 && (
            <ul className="space-y-1 text-gray-300">
              {(pass.visits ?? []).map((v) => <li key={v.id}>{istLabel(v.start_at)} · {hoursLabel(v.duration_minutes)} · {v.status}{v.status === 'ENDED' ? ` · played ${hoursLabel(v.minutes_counted)}` : ''}</li>)}
            </ul>
          )}
        </div>
      )}
      <Msg m={msg} />
    </div>
  )
}

function Passes({ packages }: { packages: GtaPackage[] }) {
  const [passes, setPasses] = useState<GtaPass[]>([])
  const [q, setQ] = useState('')
  const load = useCallback(async () => { setPasses(await gtaAdmin.passes()) }, [])
  useEffect(() => { load().catch(() => {}) }, [load])
  const shown = passes.filter((p) => !q.trim() || `${p.customer} ${p.customer_phone ?? ''} ${p.package_name}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div>
      <input className={`${input} mb-3 w-72`} placeholder="Search name, phone or package" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-3">{shown.map((p) => <PassRow key={p.id} pass={p} packages={packages} onChanged={load} />)}</div>
      {shown.length === 0 && <p className="text-gray-400">No packages found.</p>}
    </div>
  )
}

function Packages({ packages, onChanged }: { packages: GtaPackage[]; onChanged: () => Promise<void> }) {
  const { msg, busy, run } = useAction()
  const [settings, setSettings] = useState<GtaSettings | null>(null)
  const [draft, setDraft] = useState({ players: 1, name: '', hours: 1, price: 0, includes: '', badge: '' })
  useEffect(() => { gtaAdmin.settings().then(setSettings).catch(() => {}) }, [])
  return (
    <div className="space-y-6">
      <Msg m={msg} />
      {settings && (
        <div className="rounded border border-cp-cyan/20 bg-cp-gray/20 p-4 text-sm">
          <h3 className="mb-2 font-bold text-cp-yellow">Opening hours</h3>
          <div className="flex flex-wrap items-center gap-3">
            <label>Open <input className={input} type="time" value={settings.open_time.slice(0, 5)} onChange={(e) => setSettings({ ...settings, open_time: e.target.value })} /></label>
            <label>Close <input className={input} type="time" value={settings.close_time.slice(0, 5)} onChange={(e) => setSettings({ ...settings, close_time: e.target.value })} /></label>
            <button disabled={busy} className={`${btn} bg-green-600 text-white`} onClick={() => run(() => gtaAdmin.saveSettings({ open_time: settings.open_time.slice(0, 5), close_time: settings.close_time.slice(0, 5) }), 'Hours saved.')}>Save</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-gray-400"><tr><th className="p-2">Type</th><th>Name</th><th>Hours</th><th>Price ₹</th><th>Includes</th><th>Active</th><th /></tr></thead>
          <tbody>
            {packages.map((p) => <PackageRow key={p.id} pkg={p} busy={busy} run={run} onChanged={onChanged} />)}
          </tbody>
        </table>
      </div>
      <div className="rounded border border-cp-cyan/20 bg-cp-gray/20 p-4 text-sm">
        <h3 className="mb-2 font-bold text-cp-yellow">New package</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select className={input} value={draft.players} onChange={(e) => setDraft({ ...draft, players: Number(e.target.value) })}><option value={1}>Solo</option><option value={2}>Duo</option></select>
          <input className={input} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className={`${input} w-20`} type="number" min={1} value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: Number(e.target.value) })} />
          <input className={`${input} w-24`} type="number" min={0} value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
          <input className={input} placeholder="Includes" value={draft.includes} onChange={(e) => setDraft({ ...draft, includes: e.target.value })} />
          <input className={input} placeholder="Badge" value={draft.badge} onChange={(e) => setDraft({ ...draft, badge: e.target.value })} />
          <button disabled={busy || !draft.name.trim()} className={`${btn} bg-green-600 text-white`} onClick={() => run(() => gtaAdmin.createPackage({ ...draft, name: draft.name.trim(), includes: draft.includes || null, badge: draft.badge || null }), 'Package added.', onChanged)}>Add</button>
        </div>
      </div>
    </div>
  )
}

function PackageRow({ pkg, busy, run, onChanged }: { pkg: GtaPackage; busy: boolean; run: (fn: () => Promise<unknown>, ok: string, after?: () => Promise<void> | void) => Promise<void>; onChanged: () => Promise<void> }) {
  const [price, setPrice] = useState(String(pkg.price))
  const [includes, setIncludes] = useState(pkg.includes ?? '')
  return (
    <tr className="border-t border-gray-800">
      <td className="p-2">{pkg.players === 2 ? 'Duo' : 'Solo'}</td><td>{pkg.name}</td><td>{pkg.hours}</td>
      <td><input className={`${input} w-24`} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></td>
      <td><input className={input} value={includes} onChange={(e) => setIncludes(e.target.value)} /></td>
      <td><input type="checkbox" checked={pkg.active} onChange={(e) => run(() => gtaAdmin.updatePackage(pkg.id, { active: e.target.checked }), 'Updated.', onChanged)} /></td>
      <td className="space-x-2 whitespace-nowrap">
        <button disabled={busy} className={`${btn} bg-green-600 text-white`} onClick={() => run(() => gtaAdmin.updatePackage(pkg.id, { price: Number(price), includes: includes || null }), 'Saved.', onChanged)}>Save</button>
        <button disabled={busy} className={`${btn} bg-red-900 text-white`} onClick={() => { if (confirm(`Delete ${pkg.name}?`)) run(() => gtaAdmin.deletePackage(pkg.id), 'Deleted.', onChanged) }}>Delete</button>
      </td>
    </tr>
  )
}

export default function AdminGta() {
  const [tab, setTab] = useState<'schedule' | 'passes' | 'packages'>('schedule')
  const [packages, setPackages] = useState<GtaPackage[]>([])
  const loadPackages = useCallback(async () => { setPackages(await gtaAdmin.packages()) }, [])
  useEffect(() => { loadPackages().catch(() => { gta.catalog().then((c) => setPackages(c.packages)).catch(() => {}) }) }, [loadPackages])
  return (
    <AdminGuard>
      <div className="min-h-screen bg-cp-black text-white">
        <main className="px-6 pb-12 pt-6">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-4xl font-bold text-cp-yellow">GTA <span className="text-cp-cyan">VI</span></h1>
            <p className="mb-5 mt-1 text-gray-300">Dedicated PS5 · slots, timers, payments and packages</p>
            <div className="mb-5 flex gap-2">
              {(['schedule', 'passes', 'packages'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`${btn} ${tab === t ? 'bg-cp-cyan text-black' : 'bg-gray-700 text-white'}`}>{t === 'schedule' ? 'Schedule' : t === 'passes' ? 'Passes' : 'Packages & hours'}</button>
              ))}
            </div>
            {tab === 'schedule' && <Schedule packages={packages} />}
            {tab === 'passes' && <Passes packages={packages} />}
            {tab === 'packages' && <Packages packages={packages} onChanged={loadPackages} />}
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}
