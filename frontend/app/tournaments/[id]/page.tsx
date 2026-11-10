'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { NavBar } from '@/components/ui/navbar'
import { BracketView, MatchCard } from '@/components/tournaments/bracket-view'
import { DaysBar, FinalRanking } from '@/components/tournaments/days'
import { GoalsTable, StandingsTable } from '@/components/tournaments/standings-table'
import { ScheduleList } from '@/components/tournaments/schedule-panel'
import { Markdown } from '@/components/ui/markdown'
import { ShareButton } from '@/components/tournaments/share-button'
import { publicApi, sortEntrants, visitorId, type EntrantSort, type PublicDetail } from '@/lib/tournaments'

const btn = 'rounded px-4 py-2 font-semibold disabled:opacity-50'
const input = 'w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white'

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<PublicDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sort, setSort] = useState<EntrantSort>('az')
  const [busy, setBusy] = useState(false)
  const [needLogin, setNeedLogin] = useState(false) // the server said we are not signed in (expired session)
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
      if ((e as { status?: number }).status === 401) setNeedLogin(true)
      else setError((e as Error).message)
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
            <ShareButton title={t.name} text={`Join ${t.name} (${t.game}) at Neo Rift!`} />
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

        {d.days && <DaysBar info={d.days} currentId={id} base="/tournaments" publicView />}
        {(d.final_ranking?.length ?? 0) > 0 && <div className="mb-6"><FinalRanking rows={d.final_ranking ?? []} /></div>}

        {/* sign-up (each day of a tournament played over days has its own) */}
        {!t.split_days && (
        <section className="mb-8 rounded-lg border border-cp-cyan/20 bg-cp-gray/20 p-5">
          {!d.me || needLogin ? (
            canRegister ? (
              <div>
                <h2 className="mb-1 text-xl font-bold text-cp-yellow">{needLogin ? 'Please log in again to register' : 'Log in or sign up to register'}</h2>
                <p className="mb-3 text-sm text-gray-400">You need a Neo Rift account to join a tournament. It takes a minute.</p>
                <div className="flex flex-wrap gap-3">
                  <Link href={`/auth?next=${encodeURIComponent(`/tournaments/${id}`)}`} className={`${btn} bg-cp-cyan text-black`}>Log in</Link>
                  <Link href={`/auth?mode=signup&next=${encodeURIComponent(`/tournaments/${id}`)}`} className={`${btn} bg-gray-700`}>Create an account</Link>
                </div>
              </div>
            ) : <p>Registration is closed.</p>
          ) : !team ? (
            joined ? (
              <div className="flex flex-wrap items-center gap-3">
                <span>{d.me.entrant!.status === 'waitlist' ? `You're on the waitlist${d.my_waitlist_position ? `, number ${d.my_waitlist_position}` : ''}. You move up when someone withdraws.` : "You're registered ✓"}{t.entry_fee > 0 && d.me.entrant!.payment_status === 'PENDING' ? ` Pay ₹${t.entry_fee} at the counter.` : ''}</span>
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
                {myTeam.entrant ? (myTeam.entrant.status === 'waitlist' ? `Complete. On the waitlist${d.my_waitlist_position ? `, number ${d.my_waitlist_position}` : ''}.` : 'Complete and registered ✓') : `Entered once all ${t.team_size} players accept.`}
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
        )}

        {(t.description || t.prize_details || t.rules || t.starts_at) && (
          <section className="mb-8 space-y-3 text-gray-300">
            {t.starts_at && <p>🗓 Starts {new Date(t.starts_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST{t.ends_at ? `, expected to end around ${new Date(t.ends_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...(new Date(t.ends_at).getTime() - new Date(t.starts_at).getTime() > 86_400_000 ? { dateStyle: 'medium' as const } : {}), timeStyle: 'short' })} IST` : ''}</p>}
            {t.description && <p>{t.description}</p>}
            {t.prize_details && <p><b className="text-cp-yellow">Prizes:</b> {t.prize_details}</p>}
          </section>
        )}

        {t.rules && (
          <section className="mb-8 rounded-lg border border-cp-cyan/20 bg-cp-gray/20 p-5">
            <h2 className="mb-3 text-2xl font-bold text-cp-yellow">Rules</h2>
            <Markdown>{t.rules}</Markdown>
          </section>
        )}

        {t.split_days ? null : started ? (
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
            ) : (
              <div className="space-y-8">
                <BracketView matches={d.matches} />
                {d.matches.some((m) => m.scheduled_at) && (
                  <div>
                    <h2 className="mb-4 text-2xl font-bold text-cp-yellow">Match schedule</h2>
                    <ScheduleList matches={d.matches} />
                  </div>
                )}
                {(d.goals?.length ?? 0) > 0 && (
                  <div>
                    <h2 className="mb-4 text-2xl font-bold text-cp-yellow">Standings</h2>
                    <div className="rounded-lg bg-cp-gray/20 p-4"><GoalsTable rows={d.goals ?? []} /></div>
                    <p className="mt-2 text-xs text-gray-400">Ranked by goal difference, then goals scored. Updates as results come in.</p>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section>
            <h2 className="mb-3 text-2xl font-bold text-cp-yellow">Who's in ({d.entrants.filter((e) => e.status !== 'waitlist').length})</h2>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-400">Sort:</span>
              {([['az', 'A to Z'], ['newest', 'Newest first'], ['oldest', 'Oldest first']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setSort(k)} className={`rounded px-3 py-1 ${sort === k ? 'bg-cp-cyan text-black' : 'bg-gray-700 text-gray-200'}`}>{label}</button>
              ))}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sortEntrants(d.entrants.filter((e) => e.status !== 'waitlist'), sort).map((e) => (
                <li key={e.id} className="rounded bg-cp-gray/20 px-4 py-2">
                  {e.display_name}
                  {e.team_members.length > 0 && <div className="text-xs text-gray-400">{e.team_members.map((m) => m.name).join(', ')}</div>}
                </li>
              ))}
              {d.entrants.filter((e) => e.status !== 'waitlist').length === 0 && <li className="text-gray-400">Be the first to register!</li>}
            </ul>
          </section>
        )}

        {d.waitlist.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-1 text-2xl font-bold text-cp-yellow">Waitlist ({d.waitlist.length})</h2>
            <p className="mb-3 text-sm text-gray-400">
              Places are given out in this order if someone withdraws{started ? '' : ' before the bracket is made'}.
              {started && ' The bracket is already made, so the waitlist is closed.'}
            </p>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {d.waitlist.map((w) => (
                <li key={w.id} className={`flex items-center gap-3 rounded px-4 py-2 ${w.position === d.my_waitlist_position ? 'border border-cp-cyan bg-cp-cyan/10' : 'bg-cp-gray/20'}`}>
                  <span className="w-6 text-right text-yellow-400">{w.position}</span>
                  <span className="truncate">{w.display_name}{w.position === d.my_waitlist_position && <span className="ml-2 text-xs text-cp-cyan">you</span>}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  )
}
