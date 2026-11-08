import { describe, expect, it } from 'vitest'
import { goalsTable } from '../tournaments/engine'

const ents = ['A', 'B', 'C', 'D'].map((n) => ({ id: n, display_name: `Player ${n}` }))
const m = (a: string, b: string, s1: number | null, s2: number | null, winner: string | null, status = 'completed') => ({ entrant1_id: a, entrant2_id: b, score1: s1, score2: s2, winner_id: winner, status })

describe('goalsTable', () => {
  it('ranks by goal difference, then goals scored, then wins', () => {
    const t = goalsTable(ents, [m('A', 'B', 5, 1, 'A'), m('C', 'D', 3, 2, 'C')])
    expect(t.map((r) => [r.entrant_id, r.goals_for, r.goals_against, r.diff, r.rank])).toEqual([['A', 5, 1, 4, 1], ['C', 3, 2, 1, 2], ['D', 2, 3, -1, 3], ['B', 1, 5, -4, 4]])
    expect(t[0]).toMatchObject({ played: 1, won: 1, lost: 0 })
  })
  it('adds up across rounds', () => {
    const t = goalsTable(ents, [m('A', 'B', 2, 0, 'A'), m('A', 'C', 1, 2, 'C')])
    expect(t.find((r) => r.entrant_id === 'A')).toMatchObject({ played: 2, won: 1, lost: 1, goals_for: 3, goals_against: 2, diff: 1 })
  })
  it('breaks a tie on difference by goals scored', () => {
    const t = goalsTable(ents, [m('A', 'B', 4, 3, 'A'), m('C', 'D', 1, 0, 'C')])
    expect(t.slice(0, 2).map((r) => r.entrant_id)).toEqual(['A', 'C']) // both +1; A scored more
  })
  it('ignores unfinished matches, matches without scores and players who have not played', () => {
    const t = goalsTable(ents, [m('A', 'B', null, null, 'A'), m('C', 'D', 1, 0, null, 'live'), m('A', 'C', 2, 1, 'A', 'bye')])
    expect(t).toEqual([])
  })
})
