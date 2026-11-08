import { describe, expect, it } from 'vitest'
import { finalRanking, planSplit } from '../tournaments/engine'

const ids = (n: number, status = 'registered', from = 1) => Array.from({ length: n }, (_, i) => ({ id: `${status[0]}${from + i}`, status, registered_at: String(100 + from + i).padStart(4, '0') }))

describe('planSplit', () => {
  const all = [...ids(10), ...ids(5, 'waitlist')]
  it('first: the earliest registrations play on day 1, the next on day 2', () => {
    const d = planSplit(all, { days: 2, capacity: 4, method: 'first' })
    expect(d[0].active).toEqual(['r1', 'r2', 'r3', 'r4'])
    expect(d[1].active).toEqual(['r5', 'r6', 'r7', 'r8'])
  })
  it('puts the players who do not fit, then the old waitlist, on the days\' own waitlists in turn', () => {
    const d = planSplit(all, { days: 2, capacity: 4, method: 'first' })
    expect([...d[0].waitlist, ...d[1].waitlist].sort()).toEqual(['r10', 'r9', 'w1', 'w2', 'w3', 'w4', 'w5'].sort())
    expect(d[0].waitlist).toEqual(['r9', 'w1', 'w3', 'w5'])
    expect(d[1].waitlist).toEqual(['r10', 'w2', 'w4'])
  })
  it('alternate: 1st to day 1, 2nd to day 2, and so on', () => {
    const d = planSplit(ids(6), { days: 2, capacity: 3, method: 'alternate' })
    expect(d[0].active).toEqual(['r1', 'r3', 'r5'])
    expect(d[1].active).toEqual(['r2', 'r4', 'r6'])
  })
  it('random: a different draw each time but every player exactly once, and days stay within capacity', () => {
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const d = planSplit(ids(128), { days: 2, capacity: 64, method: 'random' }, rng)
    expect(d[0].active).toHaveLength(64)
    expect(d[1].active).toHaveLength(64)
    expect(new Set([...d[0].active, ...d[1].active]).size).toBe(128)
    expect(d[0].active.slice(0, 5)).not.toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
  })
  it('ignores withdrawn and disqualified players', () => {
    const d = planSplit([...ids(2), { id: 'x', status: 'withdrawn' }, { id: 'y', status: 'disqualified' }], { days: 2, capacity: 5, method: 'first' })
    expect([...d[0].active, ...d[1].active, ...d[0].waitlist, ...d[1].waitlist]).toEqual(['r1', 'r2'])
  })
  it('checked-in players count as playing', () => {
    expect(planSplit([{ id: 'c', status: 'checked_in', registered_at: '1' }], { days: 2, capacity: 5, method: 'first' })[0].active).toEqual(['c'])
  })
})

describe('finalRanking', () => {
  const ents = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((id) => ({ id, display_name: `P ${id}` }))
  // 8-player bracket: R1 A-B, C-D, E-F, G-H; semis A-C, E-G; third C-E?; final A-G
  const matches = [
    { round: 1, bracket: 'main', entrant1_id: 'A', entrant2_id: 'B', score1: 3, score2: 0, winner_id: 'A', status: 'completed' },
    { round: 1, bracket: 'main', entrant1_id: 'C', entrant2_id: 'D', score1: 2, score2: 1, winner_id: 'C', status: 'completed' },
    { round: 1, bracket: 'main', entrant1_id: 'E', entrant2_id: 'F', score1: 4, score2: 3, winner_id: 'E', status: 'completed' },
    { round: 1, bracket: 'main', entrant1_id: 'G', entrant2_id: 'H', score1: 1, score2: 0, winner_id: 'G', status: 'completed' },
    { round: 2, bracket: 'main', entrant1_id: 'A', entrant2_id: 'C', score1: 2, score2: 1, winner_id: 'A', status: 'completed' },
    { round: 2, bracket: 'main', entrant1_id: 'E', entrant2_id: 'G', score1: 0, score2: 1, winner_id: 'G', status: 'completed' },
    { round: 3, bracket: 'third', entrant1_id: 'C', entrant2_id: 'E', score1: 5, score2: 2, winner_id: 'C', status: 'completed' },
    { round: 3, bracket: 'main', entrant1_id: 'A', entrant2_id: 'G', score1: 1, score2: 0, winner_id: 'A', status: 'completed' },
  ]
  it('1 winner, 2 runner-up, 3 third-place winner, 4 third-place loser, 5 best of the rest by goals', () => {
    const r = finalRanking(ents, matches)
    expect(r.map((x) => [x.place, x.entrant_id])).toEqual([[1, 'A'], [2, 'G'], [3, 'C'], [4, 'E'], [5, 'F']])
    // of the rest, B is -3, and D, F and H are all -1: F scored the most (3), so F is 5th
  })
  it('only shows places that are decided', () => {
    const open = (m: (typeof matches)[number]) => ({ ...m, score1: null, score2: null, winner_id: null, status: 'ready' })
    const noFinal = matches.map((m) => (m.round === 3 && m.bracket === 'main' ? open(m) : m))
    expect(finalRanking(ents, noFinal).map((x) => x.place)).toEqual([3, 4])
    const noThird = matches.map((m) => (m.bracket === 'third' ? open(m) : m))
    expect(finalRanking(ents, noThird).map((x) => x.place)).toEqual([1, 2])
    expect(finalRanking(ents, matches.map((m) => (m.round >= 2 ? open(m) : m)))).toEqual([])
  })
})
