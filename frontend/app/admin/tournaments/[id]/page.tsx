'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AdminGuard } from '@/components/ui/admin-guard'
import { BracketView, MatchCard } from '@/components/tournaments/bracket-view'
import { StandingsTable } from '@/components/tournaments/standings-table'
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
  const [newName, setNewName] = useState('')
  const [order, setOrder] = useState<string[] | null>(null)
  const [preview, setPreview] = useState<Match[] | null>(null)
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

  const actions = (m: Match) => {
    if (t.status !== 'active' || m.status === 'bye' || m.status === 'pending') {
      return m.status === 'completed' && t.status !== 'completed' ? <button className={`${btn} bg-gray-700`} disabled={busy} onClick={() => run(() => api.undo(m.id))}>Undo</button> : null
    }
    if (m.status === 'completed') return <button className={`${btn} bg-gray-700`} disabled={busy} onClick={() => run(() => api.undo(m.id))}>Undo result</button>
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
      </div>
    )
  }

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
              <ShareButton title={t.name} text={`Join ${t.name} (${t.game}) at Neo Gaming Cafe!`} />
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
                <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) run(async () => { await api.addEntrant(id, { display_name: newName.trim() }); setNewName('') }) }}>
                  <input className="flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 sm:max-w-xs" placeholder="Add walk-in player / team" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <button className={`${btn} bg-green-600`} disabled={busy}>Add</button>
                </form>
              )}
              <div className="space-y-2">
                {d.entrants.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-900 px-4 py-3">
                    <span className="w-8 text-gray-500">{e.seed ?? '–'}</span>
                    <div className="min-w-[10rem] flex-1">
                      <div className="font-medium">{e.display_name}</div>
                      {e.team_members.length > 0 && <div className="text-xs text-gray-400">{e.team_members.map((m) => `${m.name}${m.status !== 'accepted' ? ` (${m.status})` : ''}`).join(', ')}</div>}
                    </div>
                    <span className="text-xs uppercase text-gray-400">{e.status.replace('_', ' ')}</span>
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
                    {!started && <button disabled={busy} className={`${btn} text-red-400`} onClick={() => run(() => api.removeEntrant(id, e.id))}>Remove</button>}
                  </div>
                ))}
                {d.entrants.length === 0 && <p className="text-gray-400">Nobody has registered yet.</p>}
              </div>

              {!started && playing.length >= 2 && (
                <div className="mt-8 rounded-lg bg-gray-900 p-5">
                  <h2 className="mb-1 text-xl font-bold">Generate bracket</h2>
                  <p className="mb-3 text-sm text-gray-400">
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
                        {d.matches.filter((m) => m.round === r).map((m) => <MatchCard key={m.id} m={m} actions={actions} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <BracketView matches={d.matches} actions={actions} />
              )
            ) : <p className="text-gray-400">The bracket has not been generated yet.</p>
          )}
        </div>
      </div>
    </AdminGuard>
  )
}
