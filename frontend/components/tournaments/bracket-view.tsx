import type { ReactNode } from 'react'
import type { Match } from '@/lib/tournaments'

interface Props {
  matches: Match[]
  /** Rendered under a match; the admin page puts Won / Lost buttons here. */
  actions?: (m: Match) => ReactNode
}

function Side({ name, score, won, lost }: { name: string | null; score: number | null; won: boolean; lost: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-1.5 ${won ? 'bg-green-900/30 text-green-300 font-semibold' : lost ? 'text-gray-500' : 'text-white'}`}>
      <span className="truncate">{name ?? <span className="italic text-gray-500">TBD</span>}</span>
      {score !== null && <span className="tabular-nums">{score}</span>}
    </div>
  )
}

export function MatchCard({ m, actions }: { m: Match; actions?: Props['actions'] }) {
  const done = m.status === 'completed' || m.status === 'bye'
  const border = m.status === 'live' ? 'border-red-500' : m.status === 'ready' ? 'border-cyan-500/60' : 'border-gray-700'
  return (
    <div className={`w-60 rounded-lg border ${border} bg-gray-900 overflow-hidden`}>
      <div className="flex justify-between px-3 py-1 text-[11px] uppercase tracking-wide text-gray-400 bg-black/40">
        <span>{m.bracket === 'third_place' ? 'Third place' : `Match ${m.position}`}</span>
        <span>{m.status === 'live' ? <b className="text-red-400">● LIVE</b> : m.status === 'bye' ? 'Bye' : m.walkover ? 'Walkover' : m.status}</span>
      </div>
      <Side name={m.entrant1_name} score={m.score1} won={done && !!m.winner_id && m.winner_id === m.entrant1_id} lost={done && !!m.winner_id && m.winner_id !== m.entrant1_id} />
      <div className="border-t border-gray-800" />
      <Side name={m.status === 'bye' ? 'BYE' : m.entrant2_name} score={m.score2} won={done && !!m.winner_id && m.winner_id === m.entrant2_id} lost={done && !!m.winner_id && m.winner_id !== m.entrant2_id} />
      {actions && <div className="border-t border-gray-800 p-2">{actions(m)}</div>}
    </div>
  )
}

/** Rounds side by side, left to right. Scrolls sideways on small screens. */
export function BracketView({ matches, actions }: Props) {
  const main = matches.filter((m) => m.bracket !== 'third_place')
  const third = matches.filter((m) => m.bracket === 'third_place')
  const rounds = Array.from(new Set(main.map((m) => m.round))).sort((a, b) => a - b)
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 min-w-max">
        {rounds.map((r) => {
          const inRound = main.filter((m) => m.round === r).sort((a, b) => a.position - b.position)
          return (
            <div key={r} className="flex flex-col">
              <h3 className="mb-3 text-center text-sm font-semibold text-cyan-400">{inRound[0]?.round_name}</h3>
              <div className="flex flex-1 flex-col justify-around gap-4">
                {inRound.map((m) => <MatchCard key={m.id} m={m} actions={actions} />)}
              </div>
            </div>
          )
        })}
        {third.length > 0 && (
          <div className="flex flex-col justify-end">
            <h3 className="mb-3 text-center text-sm font-semibold text-yellow-400">Third place</h3>
            {third.map((m) => <MatchCard key={m.id} m={m} actions={actions} />)}
          </div>
        )}
      </div>
    </div>
  )
}
