import type { StandingRow } from '@/lib/tournaments'

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (!rows.length) return <p className="text-gray-400">No table yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-gray-400 text-left">
          <tr>{['#', 'Player', 'P', 'W', 'D', 'L', '+/-', 'Pts'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entrant_id} className="border-t border-gray-800">
              <td className="px-3 py-2">{i + 1}</td>
              <td className="px-3 py-2 font-medium">{r.display_name}</td>
              <td className="px-3 py-2">{r.played}</td>
              <td className="px-3 py-2">{r.won}</td>
              <td className="px-3 py-2">{r.drawn}</td>
              <td className="px-3 py-2">{r.lost}</td>
              <td className="px-3 py-2">{r.score_for - r.score_against}</td>
              <td className="px-3 py-2 font-bold text-cyan-400">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
