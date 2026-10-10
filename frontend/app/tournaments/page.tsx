'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { NavBar } from '@/components/ui/navbar'
import { publicApi, type Invitation, type PublicTournament } from '@/lib/tournaments'

const LABEL: Record<string, string> = { open: 'Registration open', paused: 'Paused', active: 'In progress', completed: 'Finished' }
const COLOR: Record<string, string> = { open: 'text-green-400', paused: 'text-yellow-400', active: 'text-cp-cyan', completed: 'text-gray-400' }

export default function TournamentsPage() {
  const [rows, setRows] = useState<PublicTournament[] | null>(null)
  const [invites, setInvites] = useState<Invitation[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await publicApi.list())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
    publicApi.invitations().then(setInvites).catch(() => setInvites([])) // signed-out visitors just get none
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="min-h-screen bg-cp-black text-white">
      <NavBar />
      <main className="mx-auto max-w-6xl px-6 pb-12 pt-24">
        <h1 className="mb-8 text-5xl font-bold text-cp-yellow md:text-7xl">TOURNAMENTS</h1>

        {invites.length > 0 && (
          <div className="mb-8 rounded-lg border border-cp-cyan/40 bg-cp-gray/20 p-4">
            <h2 className="mb-2 font-semibold text-cp-cyan">Team invitations</h2>
            {invites.map((i) => (
              <Link key={i.team_id} href={`/tournaments/${i.tournament_id}`} className="block py-1 hover:text-cp-yellow">
                {i.captain} invited you to <b>{i.team_name}</b> for {i.tournament_name} →
              </Link>
            ))}
          </div>
        )}

        {error && <p className="mb-4 text-red-400">{error}</p>}
        {!rows ? (
          <p className="text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-300">No tournaments right now. Check back soon!</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((t) => (
              <Link key={t.id} href={`/tournaments/${t.id}`} className="block rounded-lg border border-cp-cyan/20 bg-cp-gray/20 p-5 transition hover:border-cp-cyan">
                {(t.banner_image || t.poster_image) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(t.banner_image || t.poster_image) as string} alt="" className="-mx-5 -mt-5 mb-3 h-32 w-[calc(100%+2.5rem)] max-w-none rounded-t-lg object-cover" />
                )}
                <div className={`mb-1 text-xs font-semibold uppercase ${COLOR[t.status]}`}>{LABEL[t.status] ?? t.status}</div>
                <h2 className="text-xl font-bold text-cp-yellow">{t.name}</h2>
                <p className="mb-3 text-sm text-gray-400">
                  {t.game} · {t.platform} · {t.tournament_type === 'knockout' ? 'Knockout' : 'League'}{t.team_size > 1 ? ` · teams of ${t.team_size}` : ''}
                </p>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-cp-cyan">{t.registered_count}/{t.max_players}</div>
                    <div className="text-xs text-gray-400">{t.team_size > 1 ? 'teams' : 'players'} registered</div>
                  </div>
                  <div className="text-right text-sm text-gray-300">
                    {t.prize_pool > 0 && <div>🏆 ₹{t.prize_pool}</div>}
                    <div>{t.entry_fee > 0 ? `Entry ₹${t.entry_fee}` : 'Free entry'}</div>
                    <div className="text-xs text-gray-500">👁 {t.view_count}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
