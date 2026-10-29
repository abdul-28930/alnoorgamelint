'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AdminGuard } from '@/components/ui/admin-guard'
import { BracketView, MatchCard } from '@/components/tournaments/bracket-view'
import { StandingsTable } from '@/components/tournaments/standings-table'
import { NotifyPanel } from '@/components/tournaments/notify-panel'
import { MarkdownEditor } from '@/components/tournaments/markdown-editor'
import { ImageSlot } from '@/components/tournaments/image-slot'
import { ShareButton } from '@/components/tournaments/share-button'
import { api, STATUS_STYLE, type Entrant, type Match, type TournamentDetail, type TournamentStatus } from '@/lib/tournaments'

const NEXT: Record<TournamentStatus, { to: TournamentStatus; label: string }[]> = {
  draft: [{ to: 'open', label: 'Open registration' }],
  open: [{ to: 'draft', label: 'Back to draft' }, { to: 'paused', label: 'Pause' }],
  paused: [{ to: 'open', label: 'Reopen' }, { to: 'active', label: 'Resume play' }],
  active: [{ to: 'paused', label: 'Pause' }],
  completed: [],
}

const btn = 'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50'

export default function ManageTournamentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [d, setD] = useState<TournamentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'entrants' | 'bracket'>('entrants')
  const [swapIn, setSwapIn] = useState<string | null>(null) // the waitlisted entrant being added to the bracket
  const [swapOut, setSwapOut] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newWhatsapp, setNewWhatsapp] = useState(true)
  const [order, setOrder] = useState<string[] | null>(null)
  const [preview, setPreview] = useState<Match[] | null>(null)
  const [view, setView] = useState<'bracket' | 'list'>('bracket')
  const [notice, setNotice] = useState<string | null>(null)
  const [replaceFromWaitlist, setReplaceFromWaitlist] = useState(true)
  const [rules, setRules] = useState<string | null>(null) // null = not edited
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>({})

  const load = useCallback(async () => {
    try {
      const data = await api.detail(id)
      setD(data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (d && d.matches.length) setTab('bracket')
  }, [d?.matches.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      await load()
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!d) {
    return <AdminGuard><div className="min-h-screen bg-black p-6 text-white">{error ?? 'Loading…'}</div></AdminGuard>
  }

  const t = d.tournament
  const started = d.matches.length > 0
  const playing = d.entrants.filter((e) => ['registered', 'checked_in'].includes(e.status))
  const sorted = (order ? order.map((x) => d.entrants.find((e) => e.id === x)).filter(Boolean) as Entrant[] : playing)
  const byId = new Map(d.entrants.map((e) => [e.id, e]))
  const noShowCount = playing.filter((e) => e.no_show).length
  const noResultsYet = started && !d.matches.some((m) => m.status === 'completed' || m.status === 'live')
  const matchesWithNoShow = d.matches.filter((m) => m.status !== 'completed' && m.status !== 'bye' && [m.entrant1_id, m.entrant2_id].some((x) => x && byId.get(x)?.no_show)).length
  const toggleNoShow = (e: Entrant) => run(() => api.updateEntrant(id, e.id, { no_show: !e.no_show }))
  const fieldSize = (n: number) => { let k = 1; while (k < n) k *= 2; return k }
  const move = (i: number, dir: -1 | 1) => {
    const ids = sorted.map((e) => e.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setOrder(ids)
    setPreview(null)
  }

  const report = (m: Match, winner: string | null, walkover = false) =>
    run(() => {
      const s = scores[m.id]
      const body: Record<string, unknown> = { winner_id: winner, walkover }
      if (s?.a !== undefined && s.a !== '' && s.b !== '') { body.score1 = Number(s.a); body.score2 = Number(s.b) }
      return api.result(m.id, body)
    })

  // under each player in a match: how to reach them, and whether they turned up
  const sideInfo = (eid: string | null, _slot: 1 | 2, m: Match) => {
    const e = eid ? byId.get(eid) : undefined
    if (!e) return null
    const open = m.status !== 'completed' && m.status !== 'bye' && t.status !== 'completed'
    return (
      <div className="space-y-1 px-3 pb-2 text-[11px] text-gray-400">
        {e.phone || e.email ? (
          <div className="flex flex-col">
            {e.phone && <a className="text-cyan-300 hover:underline" href={`tel:${e.phone}`}>📞 {e.phone}</a>}
            {e.email && <a className="truncate text-cyan-300 hover:underline" href={`mailto:${e.email}`}>✉ {e.email}</a>}
          </div>
        ) : <div className="italic">No contact details</div>}
        <div className="flex items-center gap-2">
          {e.no_show && <span className="rounded bg-red-900/70 px-1.5 py-0.5 font-semibold text-red-300">NO-SHOW</span>}
          {open && <button disabled={busy} className="rounded bg-gray-700 px-2 py-0.5 text-gray-200 hover:bg-gray-600 disabled:opacity-50" onClick={() => toggleNoShow(e)}>{e.no_show ? 'Mark present' : 'Mark no-show'}</button>}
        </div>
      </div>
    )
  }

  // WhatsApp the players of this match that it is coming up
  const callPlayers = (m: Match) =>
    run(async () => {
      const r = await api.callMatch(m.id)
      const sent = r.called.filter((c) => c.status === 'sent').length
      const dup = r.called.filter((c) => c.status === 'duplicate').length
      const bad = r.called.filter((c) => !['sent', 'duplicate'].includes(c.status))
      setNotice(
        `Match call: ${sent} sent${dup ? `, ${dup} already called in the last 5 minutes` : ''}${bad.length ? `. Not sent: ${bad.map((b) => `${b.name} (${b.detail ?? b.status})`).join('; ')}` : ''}.`,
      )
    })
  const callButton = (m: Match) =>
    (m.status === 'ready' || m.status === 'live') && (m.entrant1_id || m.entrant2_id) ? (
      <button className={`${btn} w-full bg-cyan-800`} disabled={busy} onClick={() => callPlayers(m)}>Call players on WhatsApp</button>
    ) : null

  const actions = (m: Match) => {
    if (t.status !== 'active' || m.status === 'bye' || m.status === 'pending') {
      return m.status === 'completed' && t.status !== 'completed' ? <button className={`${btn} bg-gray-700`} disabled={busy} onClick={() => run(() => api.undo(m.id))}>Undo</button> : null
    }
    if (m.status === 'completed') return <button className={`${btn} bg-gray-700`} disabled={busy} onClick={() => run(() => api.undo(m.id))}>Undo result</button>
    const absent1 = !!(m.entrant1_id && byId.get(m.entrant1_id)?.no_show)
    const absent2 = !!(m.entrant2_id && byId.get(m.entrant2_id)?.no_show)
    if (absent1 || absent2) {
      return (
        <div className="space-y-2">
          <div className="text-xs text-yellow-300">{absent1 && absent2 ? 'Both are no-shows. Qualify one by hand.' : 'One player is a no-show. Qualify by hand, or mark them present.'}</div>
          <div className="flex flex-wrap gap-1">
            {[[m.entrant1_id, m.entrant1_name], [m.entrant2_id, m.entrant2_name]].map(([eid, name]) => (
              <button key={eid} className={`${btn} flex-1 truncate bg-yellow-700`} disabled={busy} onClick={() => report(m, eid, true)}>Qualify {name}</button>
            ))}
          </div>
          {callButton(m)}
        </div>
      )
    }
    const s = scores[m.id] ?? { a: '', b: '' }
    const set = (k: 'a' | 'b', v: string) => setScores((p) => ({ ...p, [m.id]: { ...s, [k]: v } }))
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <input aria-label="score 1" className="w-12 rounded bg-gray-800 px-1 py-1 text-center" inputMode="numeric" value={s.a} onChange={(e) => set('a', e.target.value)} />
          <span>–</span>
          <input aria-label="score 2" className="w-12 rounded bg-gray-800 px-1 py-1 text-center" inputMode="numeric" value={s.b} onChange={(e) => set('b', e.target.value)} />
          {m.status === 'ready'
            ? <button className={`${btn} ml-auto bg-red-700`} disabled={busy} onClick={() => run(() => api.match(m.id, { status: 'live' }))}>Go live</button>
            : <button className={`${btn} ml-auto bg-gray-700`} disabled={busy} onClick={() => run(() => api.match(m.id, { status: 'ready' }))}>Not live</button>}
        </div>
        <div className="flex flex-wrap gap-1">
          {[[m.entrant1_id, m.entrant1_name], [m.entrant2_id, m.entrant2_name]].map(([eid, name]) => (
            <button key={eid} className={`${btn} flex-1 truncate bg-green-700`} disabled={busy} onClick={() => report(m, eid)} title={`${name} won, ${name === m.entrant1_name ? m.entrant2_name : m.entrant1_name} lost`}>
              {name} won
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {t.tournament_type === 'league' && <button className={`${btn} bg-gray-700`} disabled={busy} onClick={() => report(m, null)}>Draw</button>}
          {[[m.entrant1_id, m.entrant2_name], [m.entrant2_id, m.entrant1_name]].map(([eid, other]) => (
            <button key={eid} className={`${btn} bg-yellow-800 text-xs`} disabled={busy} onClick={() => report(m, eid, true)}>{other} no-show</button>
          ))}
        </div>
        {callButton(m)}
      </div>
    )
  }

  const generatePanel = (
    <div className="rounded-lg bg-gray-900 p-5">
                  <h2 className="mb-1 text-xl font-bold">Generate bracket</h2>
                  <p className="mb-3 text-sm text-gray-400">
                    {playing.length} registered of {t.max_players}. The field does not have to be full: empty places become byes ({fieldSize(playing.length) - playing.length} bye{fieldSize(playing.length) - playing.length === 1 ? '' : 's'}, given to the top seeds).{' '}
                    {t.seeding === 'manual' ? 'Order the entrants below (top = seed 1).' : 'Seeding is random unless you reorder the list.'}
                  </p>
                  <ol className="mb-4 space-y-1">
                    {sorted.map((e, i) => (
                      <li key={e.id} className="flex items-center gap-2">
                        <span className="w-6 text-right text-gray-500">{i + 1}</span>
                        <span className="flex-1">{e.display_name}</span>
                        <button className={`${btn} bg-gray-700`} onClick={() => move(i, -1)} aria-label="move up">↑</button>
                        <button className={`${btn} bg-gray-700`} onClick={() => move(i, 1)} aria-label="move down">↓</button>
                      </li>
                    ))}
                  </ol>
                  <div className="flex gap-2">
                    <button disabled={busy} className={`${btn} bg-gray-700`} onClick={() => run(async () => setPreview((await api.preview(id, order ?? undefined)).matches))}>Preview</button>
                    <button disabled={busy} className={`${btn} bg-green-600`} onClick={() => { if (confirm('Generate the bracket? Registration closes and play starts.')) run(async () => { await api.generate(id, order ?? undefined); setOrder(null); setPreview(null) }) }}>Generate & start</button>
                  </div>
                  {preview && <div className="mt-4"><BracketView matches={preview} /></div>}
                </div>
  )

  return (
    <AdminGuard>
      <div className="min-h-screen bg-black p-6 text-white">
        <div className="mx-auto max-w-7xl">
          <Link href="/admin/tournaments" className="text-sm text-cyan-400">← All tournaments</Link>
          <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{t.name}</h1>
            <span className={`rounded px-2 py-0.5 text-xs uppercase ${STATUS_STYLE[t.status]}`}>{t.status}</span>
          </div>
          <p className="mb-4 text-gray-400">
            {t.game} · {t.platform} · {t.tournament_type === 'knockout' ? 'Single elimination' : 'Round robin'} · best of {t.best_of}
            {t.entry_fee > 0 && ` · entry ₹${t.entry_fee}`}
          </p>

          <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-md">
            <div className="rounded-lg bg-gray-900 p-3 text-center"><div className="text-2xl font-bold text-cyan-400">{t.registered_count}/{t.max_players}</div><div className="text-xs text-gray-400">registered</div></div>
            <div className="rounded-lg bg-gray-900 p-3 text-center"><div className="text-2xl font-bold text-yellow-400">{t.waitlist_count}</div><div className="text-xs text-gray-400">waitlist</div></div>
            <div className="rounded-lg bg-gray-900 p-3 text-center"><div className="text-2xl font-bold text-purple-400">{t.view_count}</div><div className="text-xs text-gray-400">views</div></div>
          </div>

          {t.status !== 'draft' && (
            <div className="mb-6 rounded-lg bg-gray-900 p-4">
              <div className="mb-2 text-sm text-gray-400">Public page: <a className="text-cyan-400 underline" href={`/tournaments/${id}`} target="_blank" rel="noopener noreferrer">/tournaments/{id.slice(0, 8)}…</a></div>
              <ShareButton title={t.name} text={`Join ${t.name} (${t.game}) at Neo Rift!`} path={`/tournaments/${id}`} />
            </div>
          )}

          <details className="mb-6 rounded-lg bg-gray-900 p-4" open={!t.banner_image && !t.poster_image}>
            <summary className="cursor-pointer font-semibold">Poster and banner</summary>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <ImageSlot id={id} kind="banner" url={t.banner_image} onChange={load} />
              <ImageSlot id={id} kind="poster" url={t.poster_image} onChange={load} />
            </div>
          </details>

          <details className="mb-6 rounded-lg bg-gray-900 p-4">
            <summary className="cursor-pointer font-semibold">Send WhatsApp notification</summary>
            <div className="mt-4"><NotifyPanel id={id} tournamentName={t.name} matches={d.matches} /></div>
          </details>

          <details className="mb-6 rounded-lg bg-gray-900 p-4">
            <summary className="cursor-pointer font-semibold">Rules (Markdown)</summary>
            <div className="mt-4 space-y-3">
              <MarkdownEditor value={rules ?? t.rules ?? ''} onChange={setRules} rows={14} />
              <button
                disabled={busy || rules === null}
                className={`${btn} bg-green-600`}
                onClick={() => run(async () => { await api.update(id, { rules: (rules ?? '').trim() || null }); setRules(null) })}
              >Save rules</button>
            </div>
          </details>

          {error && <div className="mb-4 rounded-lg border border-red-600 bg-red-900/50 p-3 text-red-300">{error}</div>}

          {d.champion_name && <div className="mb-6 rounded-lg border border-yellow-500 bg-yellow-900/20 p-4 text-center text-2xl font-bold text-yellow-300">🏆 Champion: {d.champion_name}</div>}

          <div className="mb-6 flex flex-wrap gap-2">
            {NEXT[t.status].map((n) => (
              <button key={n.to} disabled={busy} className={`${btn} bg-cyan-600`} onClick={() => run(() => api.setStatus(id, n.to))}>{n.label}</button>
            ))}
            {!started && (
              <button
                disabled={busy}
                className={`${btn} bg-red-900`}
                onClick={() => { if (confirm('Delete this tournament and all registrations?')) run(async () => { await api.remove(id); router.push('/admin/tournaments') }) }}
              >Delete</button>
            )}
          </div>

          <div className="mb-4 flex gap-2 border-b border-gray-800">
            {(['entrants', 'bracket'] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 capitalize ${tab === k ? 'border-b-2 border-cyan-400 text-cyan-400' : 'text-gray-400'}`}>
                {k === 'entrants' ? `Entrants (${d.entrants.length})` : t.tournament_type === 'league' ? 'Matches & table' : 'Bracket'}
              </button>
            ))}
          </div>

          {tab === 'entrants' && (
            <div>
              {!started && (
                <form
                  className="mb-4 rounded-lg bg-gray-900 p-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!newName.trim() || !newPhone.trim()) return
                    run(async () => {
                      await api.addEntrant(id, { display_name: newName.trim(), phone: newPhone.trim(), ...(newEmail.trim() ? { email: newEmail.trim() } : {}), send_whatsapp: newWhatsapp })
                      setNewName(''); setNewPhone(''); setNewEmail('')
                    })
                  }}
                >
                  <div className="mb-2 text-sm font-semibold text-cyan-300">Register a player on their behalf</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input className="rounded border border-gray-600 bg-gray-800 px-3 py-2" placeholder="Name *" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <input className="rounded border border-gray-600 bg-gray-800 px-3 py-2" placeholder="Phone * (10 digits)" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                    <input className="rounded border border-gray-600 bg-gray-800 px-3 py-2" placeholder="Email (optional)" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={newWhatsapp} onChange={(e) => setNewWhatsapp(e.target.checked)} />Send them the WhatsApp confirmation</label>
                    <button className={`${btn} bg-green-600`} disabled={busy || !newName.trim() || !newPhone.trim()}>Register player</button>
                  </div>
                </form>
              )}
              <div className="space-y-2">
                {d.entrants.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-900 px-4 py-3">
                    <span className="w-8 text-gray-500">{e.seed ?? '–'}</span>
                    <div className="min-w-[10rem] flex-1">
                      <div className="font-medium">{e.display_name}</div>
                      {(e.phone || e.email) && <div className="text-xs text-cyan-300">{[e.phone, e.email].filter(Boolean).join(' · ')}</div>}
                      {e.team_members.length > 0 && <div className="text-xs text-gray-400">{e.team_members.map((m) => `${m.name}${m.status !== 'accepted' ? ` (${m.status})` : ''}`).join(', ')}</div>}
                    </div>
                    <span className="text-xs uppercase text-gray-400">{e.status.replace('_', ' ')}</span>
                    {e.no_show && <span className="rounded bg-red-900/70 px-1.5 py-0.5 text-xs font-semibold text-red-300">NO-SHOW</span>}
                    {!['withdrawn', 'disqualified', 'waitlist'].includes(e.status) && t.status !== 'completed' && (
                      <button disabled={busy} className={`${btn} bg-gray-700`} onClick={() => toggleNoShow(e)}>{e.no_show ? 'Mark present' : 'Mark no-show'}</button>
                    )}
                    {t.entry_fee > 0 && (
                      <button disabled={busy} className={`${btn} ${e.payment_status === 'PAID' ? 'bg-green-900 text-green-300' : 'bg-gray-700'}`}
                        onClick={() => run(() => api.updateEntrant(id, e.id, { payment_status: e.payment_status === 'PAID' ? 'PENDING' : 'PAID' }))}>
                        {e.payment_status === 'PAID' ? 'Paid ✓' : 'Mark paid'}
                      </button>
                    )}
                    {!['withdrawn', 'disqualified'].includes(e.status) && (
                      <>
                        {e.status === 'registered' && t.status !== 'completed' && <button disabled={busy} className={`${btn} bg-gray-700`} onClick={() => run(() => api.updateEntrant(id, e.id, { status: 'checked_in' }))}>Check in</button>}
                        {e.status === 'waitlist' && !started && <button disabled={busy} className={`${btn} bg-gray-700`} onClick={() => run(() => api.updateEntrant(id, e.id, { status: 'registered' }))}>Promote</button>}
                        <button disabled={busy} className={`${btn} bg-yellow-800`} onClick={() => { if (confirm(`Withdraw ${e.display_name}?`)) run(() => api.updateEntrant(id, e.id, { status: 'withdrawn' })) }}>Withdraw</button>
                        <button disabled={busy} className={`${btn} bg-red-900`} onClick={() => { if (confirm(`Disqualify ${e.display_name}?`)) run(() => api.updateEntrant(id, e.id, { status: 'disqualified' })) }}>DQ</button>
                      </>
                    )}
                    {!e.user_id && !e.team_id && !['withdrawn', 'disqualified'].includes(e.status) && (
                      <button disabled={busy} className={`${btn} bg-gray-700`} onClick={() => {
                        const phone = window.prompt(`Phone for ${e.display_name} (10 digits)`, e.phone ?? '')
                        if (phone === null) return
                        const email = window.prompt(`Email for ${e.display_name} (optional, leave empty for none)`, e.email ?? '')
                        if (email === null) return
                        run(() => api.updateEntrant(id, e.id, { phone: phone.trim() || null, email: email.trim() || null }))
                      }}>Edit contact</button>
                    )}
                    {e.status === 'waitlist' && started && t.status !== 'completed' && (
                      <button disabled={busy} className={`${btn} bg-cyan-800`} onClick={() => { setSwapIn(swapIn === e.id ? null : e.id); setSwapOut('') }}>Add to bracket</button>
                    )}
                    {!started && <button disabled={busy} className={`${btn} text-red-400`} onClick={() => run(() => api.removeEntrant(id, e.id))}>Remove</button>}
                    {swapIn === e.id && (() => {
                      const absent = d.entrants.filter((x) => x.no_show && ['registered', 'checked_in'].includes(x.status))
                      return (
                        <div className="basis-full rounded border border-cyan-800 bg-gray-800 p-3 text-sm">
                          {absent.length === 0 ? (
                            <p className="text-gray-300">Nobody is marked as a no-show. Mark the player who has not come as "no-show" first, then choose them here.</p>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <span>Put <b>{e.display_name}</b> in the place of</span>
                              <select className="rounded border border-gray-600 bg-gray-900 px-2 py-1" value={swapOut} onChange={(ev) => setSwapOut(ev.target.value)}>
                                <option value="">Choose the no-show…</option>
                                {absent.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
                              </select>
                              <button disabled={busy || !swapOut} className={`${btn} bg-green-600`} onClick={() => {
                                const out = absent.find((x) => x.id === swapOut)
                                if (!out || !confirm(`${e.display_name} takes ${out.display_name}'s place in the bracket. ${out.display_name} is withdrawn and ${e.display_name} is told on WhatsApp. Everyone else keeps their match.`)) return
                                run(async () => { await api.swapWaitlist(id, swapOut, e.id); setSwapIn(null); setNotice(`${e.display_name} is now in the bracket in place of ${out.display_name}.`) })
                              }}>Confirm</button>
                              <button className={`${btn} bg-gray-700`} onClick={() => setSwapIn(null)}>Cancel</button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ))}
                {d.entrants.length === 0 && <p className="text-gray-400">Nobody has registered yet.</p>}
              </div>

              {!started && (
                <button className={`${btn} mt-6 bg-green-600`} onClick={() => setTab('bracket')}>
                  {playing.length >= 2 ? 'Next: generate the bracket →' : 'Bracket (needs at least 2 registered entrants)'}
                </button>
              )}
            </div>
          )}

          {tab === 'bracket' && (
            started ? (
              t.tournament_type === 'league' ? (
                <div className="space-y-8">
                  <div className="rounded-lg bg-gray-900 p-4"><StandingsTable rows={d.standings.map((r) => ({ ...r, display_name: (r as { display_name?: string | null }).display_name ?? null }))} /></div>
                  {Array.from(new Set(d.matches.map((m) => m.round))).sort((a, b) => a - b).map((r) => (
                    <div key={r}>
                      <h3 className="mb-3 font-semibold text-cyan-400">Round {r}</h3>
                      <div className="flex flex-wrap gap-4">
                        {d.matches.filter((m) => m.round === r).map((m) => <MatchCard key={m.id} m={m} actions={actions} side={sideInfo} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-900 p-3">
                    <div className="flex overflow-hidden rounded">
                      {(['bracket', 'list'] as const).map((v) => (
                        <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-sm ${view === v ? 'bg-cyan-600' : 'bg-gray-700'}`}>{v === 'bracket' ? 'Bracket' : 'Match list'}</button>
                      ))}
                    </div>
                    <span className="text-sm text-gray-400">{playing.length - noShowCount} here · <span className={noShowCount ? 'text-red-300' : ''}>{noShowCount} no-show</span></span>
                    <div className="ml-auto flex flex-wrap items-center gap-3">
                      {t.waitlist_count > 0 && (
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input type="checkbox" checked={replaceFromWaitlist} onChange={(e) => setReplaceFromWaitlist(e.target.checked)} />
                          Replace no-shows from the waitlist ({t.waitlist_count} waiting)
                        </label>
                      )}
                      <button
                        disabled={busy || noShowCount === 0 || !noResultsYet}
                        title={!noResultsYet ? 'Only possible before any match is live or finished (undo results first)' : noShowCount === 0 ? 'Mark the no-shows first' : 'Re-draw so no-shows play no-shows'}
                        className={`${btn} bg-yellow-700`}
                        onClick={() => {
                          const swaps = replaceFromWaitlist ? Math.min(noShowCount, t.waitlist_count) : 0
                          const left = noShowCount - swaps
                          if (!confirm(`Reshuffle the bracket?\n\n${swaps ? `${swaps} no-show${swaps === 1 ? '' : 's'} will be replaced by the oldest waiting player${swaps === 1 ? '' : 's'}.\n` : ''}${playing.length - noShowCount + swaps} players who are here will play each other${left ? `, and ${left} no-show${left === 1 ? '' : 's'} will play each other. With an odd number, one match mixes the two and you qualify it by hand` : ''}.`)) return
                          run(async () => {
                            const r = await api.reshuffle(id, replaceFromWaitlist)
                            setNotice(`Bracket reshuffled: ${r.replaced ? `${r.replaced} replaced from the waitlist, ` : ''}${r.present} here, ${r.no_shows} no-show.${r.no_shows ? ' Matches with a no-show have yellow Qualify buttons.' : ''}`)
                          })
                        }}
                      >Reshuffle for no-shows</button>
                    </div>
                  </div>
                  {notice && <div className="rounded border border-yellow-600 bg-yellow-900/20 p-3 text-sm text-yellow-200">{notice}</div>}
                  {matchesWithNoShow > 0 && <div className="text-sm text-yellow-300">{matchesWithNoShow} open match{matchesWithNoShow === 1 ? '' : 'es'} involve a no-show: qualify them by hand with the yellow buttons.</div>}
                  {view === 'bracket' ? (
                    <BracketView matches={d.matches} actions={actions} side={sideInfo} />
                  ) : (
                    <div className="space-y-8">
                      {Array.from(new Set(d.matches.map((m) => `${m.bracket}|${m.round}`))).map((key) => {
                        const group = d.matches.filter((m) => `${m.bracket}|${m.round}` === key).sort((a, b) => a.position - b.position)
                        return (
                          <div key={key}>
                            <h3 className="mb-3 font-semibold text-cyan-400">{group[0].bracket === 'third' ? 'Third place' : group[0].round_name}</h3>
                            <div className="flex flex-wrap gap-4">
                              {group.map((m) => (
                                <div key={m.id}>
                                  <div className="mb-1 text-sm text-gray-300">{m.entrant1_name ?? 'TBD'} <span className="text-gray-500">vs</span> {m.status === 'bye' ? 'BYE' : m.entrant2_name ?? 'TBD'}</div>
                                  <MatchCard m={m} actions={actions} side={sideInfo} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            ) : playing.length >= 2 ? generatePanel : (
              <div className="rounded-lg bg-gray-900 p-5">
                <h2 className="mb-1 text-xl font-bold">Generate bracket</h2>
                <p className="mb-3 text-gray-400">At least 2 registered players are needed. {playing.length} registered so far; add or promote entrants in the Entrants tab.</p>
                <button disabled className={`${btn} bg-green-600`}>Generate &amp; start</button>
              </div>
            )
          )}
        </div>
      </div>
    </AdminGuard>
  )
}
