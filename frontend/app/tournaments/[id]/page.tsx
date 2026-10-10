'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { NavBar } from '@/components/ui/navbar'
import { BracketView, MatchCard } from '@/components/tournaments/bracket-view'
import { StandingsTable } from '@/components/tournaments/standings-table'
import { ShareButton } from '@/components/tournaments/share-button'
import { publicApi, visitorId, type PublicDetail } from '@/lib/tournaments'

const btn = 'rounded px-4 py-2 font-semibold disabled:opacity-50'
const input = 'w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white'

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<PublicDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [mates, setMates] = useState('')
  const [inviteName, setInviteName] = useState('')

  const load = useCallback(async () => {
    try {
      setD(await publicApi.detail(id))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    load()
    publicApi.view(id, visitorId()).then(load).catch(() => undefined) // counted once per visitor per day
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [id, load])

  const act = async (fn: () => Promise<{ message: string }>) => {
    setBusy(true)
    setNotice(null)
    try {
      setNotice((await fn()).message)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!d) {
    return <div className="min-h-screen bg-cp-black text-white"><NavBar /><main className="px-6 pt-28">{error ?? 'Loading…'}</main></div>
  }

  const t = d.tournament
  const team = t.team_size > 1
  const myTeam = d.me?.teams.find((x) => x.my_status === 'accepted') ?? d.me?.teams[0] ?? null
  const joined = !!d.me?.entrant && d.me.entrant.status !== 'withdrawn'
  const canRegister = t.status === 'open' && (!t.registration_closes_at || new Date(t.registration_closes_at) > new Date())
  const started = d.matches.length > 0
  const full = t.registered_count >= t.max_players

  return (
    <div className="min-h-screen bg-cp-black text-white">
      <NavBar />
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-24">
        <Link href="/tournaments" className="text-sm text-cp-cyan">← All tournaments</Link>
        {t.banner_image && (
          <div className="mb-4 mt-3 overflow-hidden rounded-lg border border-cp-cyan/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.banner_image} alt={`${t.name} banner`} className="max-h-72 w-full object-cover" />
          </div>
        )}
        <div className="mb-4 mt-2 flex flex-col gap-4 sm:flex-row sm:items-start">
          {t.poster_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.poster_image} alt={`${t.name} poster`} className="w-40 shrink-0 rounded-lg border border-cp-cyan/20 sm:w-48" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="mb-1 text-4xl font-bold text-cp-yellow md:text-5xl">{t.name}</h1>
            <p className="mb-4 text-gray-400">
              {t.game} · {t.platform} · {t.tournament_type === 'knockout' ? 'Single elimination' : 'Round robin'} · best of {t.best_of}
              {team ? ` · teams of ${t.team_size}` : ''}
            </p>
            <ShareButton title={t.name} text={`Join ${t.name} (${t.game}) at Neo Gaming Cafe!`} />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-cp-gray/20 p-3 text-center"><div className="text-2xl font-bold text-cp-cyan">{t.registered_count}/{t.max_players}</div><div className="text-xs text-gray-400">registered (live)</div></div>
          <div className="rounded-lg bg-cp-gray/20 p-3 text-center"><div className="text-2xl font-bold text-yellow-400">{t.waitlist_count}</div><div className="text-xs text-gray-400">waitlist</div></div>
          <div className="rounded-lg bg-cp-gray/20 p-3 text-center"><div className="text-2xl font-bold text-purple-400">{t.view_count}</div><div className="text-xs text-gray-400">views</div></div>
          <div className="rounded-lg bg-cp-gray/20 p-3 text-center"><div className="text-2xl font-bold text-green-400">{t.prize_pool > 0 ? `₹${t.prize_pool}` : '–'}</div><div className="text-xs text-gray-400">prize pool</div></div>
        </div>

        {d.champion_name && <div className="mb-6 rounded-lg border border-yellow-500 bg-yellow-900/20 p-4 text-center text-2xl font-bold text-yellow-300">🏆 Champion: {d.champion_name}</div>}
        {error && <div className="mb-4 rounded border border-red-600 bg-red-900/40 p-3 text-red-300">{error}</div>}
        {notice && <div className="mb-4 rounded border border-green-600 bg-green-900/30 p-3 text-green-300">{notice}</div>}

        {/* sign-up */}
        <section className="mb-8 rounded-lg border border-cp-cyan/20 bg-cp-gray/20 p-5">
          {!d.me ? (
            <p>{canRegister ? <>Sign in to register. <Link href="/auth" className="text-cp-cyan underline">Sign in or create an account</Link></> : 'Registration is closed.'}</p>
          ) : !team ? (
            joined ? (
              <div className="flex flex-wrap items-center gap-3">
                <span>{d.me.entrant!.status === 'waitlist' ? "You're on the waitlist." : "You're registered ✓"}{t.entry_fee > 0 && d.me.entrant!.payment_status === 'PENDING' ? ` Pay ₹${t.entry_fee} at the counter.` : ''}</span>
                {!started && <button className={`${btn} bg-gray-700`} disabled={busy} onClick={() => act(() => publicApi.withdraw(id))}>Withdraw</button>}
              </div>
            ) : canRegister ? (
              <div className="flex flex-wrap items-center gap-3">
                <button className={`${btn} bg-cp-cyan text-black`} disabled={busy} onClick={() => act(() => publicApi.register(id))}>{full ? 'Join the waitlist' : 'Register'}</button>
                {t.entry_fee > 0 && <span className="text-sm text-gray-400">Entry ₹{t.entry_fee}, paid at the counter.</span>}
              </div>
            ) : <p>Registration is closed.</p>
          ) : myTeam ? (
            <div>
              <h2 className="mb-1 text-xl font-bold text-cp-yellow">Your team: {myTeam.name}</h2>
              <p className="mb-3 text-sm text-gray-400">
                {myTeam.entrant ? (myTeam.entrant.status === 'waitlist' ? 'Complete. On the waitlist.' : 'Complete and registered ✓') : `Entered once all ${t.team_size} players accept.`}
                {t.entry_fee > 0 && myTeam.entrant?.payment_status === 'PENDING' ? ` Pay ₹${t.entry_fee} at the counter.` : ''}
              </p>
              <ul className="mb-3 space-y-1">
                {myTeam.members.map((m, i) => <li key={i}>{m.name} <span className="text-xs text-gray-400">{m.status === 'accepted' ? '✓' : '(invited)'}</span></li>)}
              </ul>
              {myTeam.my_status === 'invited' && !started && (
                <div className="flex gap-2"><button className={`${btn} bg-cp-cyan text-black`} disabled={busy} onClick={() => act(() => publicApi.accept(id, myTeam.id))}>Accept invitation</button><button className={`${btn} bg-gray-700`} disabled={busy} onClick={() => act(() => publicApi.leaveTeam(id, myTeam.id))}>Decline</button></div>
              )}
              {myTeam.my_status === 'accepted' && !started && (
                <div className="space-y-3">
                  {myTeam.is_captain && myTeam.members.length < t.team_size && (
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (inviteName.trim()) act(async () => { const r = await publicApi.invite(id, myTeam.id, inviteName.trim()); setInviteName(''); return r }) }}>
                      <input className={`${input} sm:max-w-xs`} placeholder="Invite by username" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                      <button className={`${btn} bg-cp-cyan text-black`} disabled={busy}>Invite</button>
                    </form>
                  )}
                  <button className={`${btn} bg-red-900`} disabled={busy} onClick={() => { if (confirm(myTeam.is_captain ? 'Disband the team?' : 'Leave the team?')) act(() => publicApi.leaveTeam(id, myTeam.id)) }}>{myTeam.is_captain ? 'Disband team' : 'Leave team'}</button>
                </div>
              )}
            </div>
          ) : canRegister ? (
            <form className="grid gap-3 sm:max-w-md" onSubmit={(e) => { e.preventDefault(); act(() => publicApi.createTeam(id, teamName, mates.split(/[\s,]+/).filter(Boolean))) }}>
              <h2 className="text-xl font-bold text-cp-yellow">Create a team (you're the captain)</h2>
              <input className={input} placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              <input className={input} placeholder={`Usernames of up to ${t.team_size - 1} teammates, separated by commas`} value={mates} onChange={(e) => setMates(e.target.value)} />
              <button className={`${btn} bg-cp-cyan text-black`} disabled={busy || teamName.trim().length < 2}>Create team</button>
              <p className="text-xs text-gray-400">Teammates get an invitation on the Tournaments page. The team is entered when everyone accepts. Got an invitation? Open the tournament it is for.</p>
            </form>
          ) : <p>Registration is closed.</p>}
        </section>

        {(t.description || t.prize_details || t.rules || t.starts_at) && (
          <section className="mb-8 space-y-3 text-gray-300">
            {t.starts_at && <p>🗓 Starts {new Date(t.starts_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST</p>}
            {t.description && <p>{t.description}</p>}
            {t.prize_details && <p><b className="text-cp-yellow">Prizes:</b> {t.prize_details}</p>}
            {t.rules && <div><b className="text-cp-yellow">Rules</b><p className="whitespace-pre-line">{t.rules}</p></div>}
          </section>
        )}

        {started ? (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-cp-yellow">{t.tournament_type === 'league' ? 'Table & fixtures' : 'Bracket'}</h2>
            {t.tournament_type === 'league' ? (
              <div className="space-y-8">
                <div className="rounded-lg bg-cp-gray/20 p-4"><StandingsTable rows={d.standings} /></div>
                {Array.from(new Set(d.matches.map((m) => m.round))).sort((a, b) => a - b).map((r) => (
                  <div key={r}>
                    <h3 className="mb-3 font-semibold text-cp-cyan">Round {r}</h3>
                    <div className="flex flex-wrap gap-4">{d.matches.filter((m) => m.round === r).map((m) => <MatchCard key={m.id} m={m} />)}</div>
                  </div>
                ))}
              </div>
            ) : <BracketView matches={d.matches} />}
          </section>
        ) : (
          <section>
            <h2 className="mb-3 text-2xl font-bold text-cp-yellow">Who's in ({d.entrants.filter((e) => e.status !== 'waitlist').length})</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {d.entrants.map((e) => (
                <li key={e.id} className="rounded bg-cp-gray/20 px-4 py-2">
                  {e.display_name}{e.status === 'waitlist' && <span className="ml-2 text-xs text-yellow-400">waitlist</span>}
                  {e.team_members.length > 0 && <div className="text-xs text-gray-400">{e.team_members.map((m) => m.name).join(', ')}</div>}
                </li>
              ))}
              {d.entrants.length === 0 && <li className="text-gray-400">Be the first to register!</li>}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
