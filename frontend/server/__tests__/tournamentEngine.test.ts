import { describe, expect, it } from 'vitest'
import {
  computeStandings, generateRoundRobin, generateSingleElimination, nextPowerOfTwo, roundName, seedOrder, shuffle, totalRounds,
  type GeneratedMatch, type StandingMatch,
} from '../tournaments/engine'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`) // e1 = seed 1
const counter = () => { let i = 0; return () => `m${++i}` }
const seedOf = (id: string | null) => (id ? Number(id.slice(1)) : Infinity)

/** Plays a bracket the way the database functions do: the better seed always wins, winners (and semi-final losers) move on. */
function play(matches: GeneratedMatch[]) {
  const byId = new Map(matches.map((m) => [m.id, { ...m }]))
  const put = (matchId: string | null, slot: number | null, entrant: string | null) => {
    if (!matchId || !slot) return
    const next = byId.get(matchId)!
    if (slot === 1) next.entrant1_id = entrant
    else next.entrant2_id = entrant
    if (next.entrant1_id && next.entrant2_id && next.status === 'pending') next.status = 'ready'
  }
  const order = Array.from(byId.values()).sort((a, b) => a.round - b.round || a.position - b.position)
  for (const m of order) {
    if (m.status === 'bye') continue
    expect(m.status, `match r${m.round}p${m.position} must be ready when its turn comes`).toBe('ready')
    const winner = seedOf(m.entrant1_id) < seedOf(m.entrant2_id) ? m.entrant1_id : m.entrant2_id
    const loser = winner === m.entrant1_id ? m.entrant2_id : m.entrant1_id
    m.winner_id = winner
    m.status = 'completed'
    put(m.next_match_id, m.next_slot, winner)
    put(m.loser_next_match_id, m.loser_next_slot, loser)
  }
  return byId
}

describe('seedOrder', () => {
  it('puts seeds in the standard bracket order', () => {
    expect(seedOrder(2)).toEqual([1, 2])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    expect(seedOrder(16).slice(0, 4)).toEqual([1, 16, 8, 9])
  })
  it('keeps the top two seeds in opposite halves', () => {
    for (const size of [4, 8, 16, 32]) {
      const order = seedOrder(size)
      expect(order.indexOf(1) < size / 2).toBe(true)
      expect(order.indexOf(2) >= size / 2).toBe(true)
    }
  })
  it('rejects sizes that are not powers of two', () => {
    expect(() => seedOrder(6)).toThrow()
    expect(nextPowerOfTwo(5)).toBe(8)
    expect(nextPowerOfTwo(8)).toBe(8)
  })
})

describe('generateSingleElimination', () => {
  it('builds a valid bracket for every field size from 2 to 40', () => {
    for (let n = 2; n <= 40; n++) {
      const matches = generateSingleElimination(ids(n), { newId: counter() })
      const size = nextPowerOfTwo(n)
      const byes = matches.filter((m) => m.status === 'bye')
      const real = matches.filter((m) => m.status !== 'bye')

      expect(byes).toHaveLength(size - n)
      expect(real).toHaveLength(n - 1) // every real match eliminates exactly one entrant
      expect(totalRounds(matches)).toBe(Math.log2(size))

      // top seeds get the byes, and nobody gets two
      byes.forEach((b) => expect(seedOf(b.winner_id)).toBeLessThanOrEqual(size - n))
      const round1 = matches.filter((m) => m.round === 1)
      const entrantsInRound1 = round1.flatMap((m) => [m.entrant1_id, m.entrant2_id]).filter(Boolean)
      expect(new Set(entrantsInRound1).size).toBe(n)
      round1.forEach((m) => expect(m.entrant1_id || m.entrant2_id).toBeTruthy()) // never an empty match

      // every non-final match feeds exactly one slot of one match in the next round, and no slot is fed twice
      const byId = new Map(matches.map((m) => [m.id, m]))
      const feeds = new Map<string, number[]>()
      matches.filter((m) => m.next_match_id).forEach((m) => {
        expect(byId.get(m.next_match_id!)!.round).toBe(m.round + 1)
        feeds.set(m.next_match_id!, [...(feeds.get(m.next_match_id!) ?? []), m.next_slot!])
      })
      feeds.forEach((slots) => expect(slots.sort()).toEqual([1, 2]))
      expect(matches.filter((m) => !m.next_match_id && m.bracket === 'main')).toHaveLength(1) // one final
    }
  })

  it('plays through to a champion for every size (better seed always wins)', () => {
    for (let n = 2; n <= 40; n++) {
      const played = play(generateSingleElimination(ids(n), { newId: counter() }))
      const final = Array.from(played.values()).find((m) => !m.next_match_id && m.bracket === 'main')!
      expect(final.status).toBe('completed')
      expect(final.winner_id).toBe('e1')
      played.forEach((m) => expect(['completed', 'bye']).toContain(m.status))
    }
  })

  it('places byes so a bye match is already won and its winner is waiting in round 2', () => {
    const matches = generateSingleElimination(ids(6), { newId: counter() }) // size 8, two byes for seeds 1 and 2
    const byes = matches.filter((m) => m.status === 'bye')
    expect(byes.map((b) => b.winner_id).sort()).toEqual(['e1', 'e2'])
    const byId = new Map(matches.map((m) => [m.id, m]))
    byes.forEach((b) => {
      const next = byId.get(b.next_match_id!)!
      expect(b.next_slot === 1 ? next.entrant1_id : next.entrant2_id).toBe(b.winner_id)
    })
  })

  it('adds a third-place match fed by the semi-final losers, only with 4+ entrants', () => {
    const matches = generateSingleElimination(ids(8), { thirdPlace: true, newId: counter() })
    const third = matches.find((m) => m.bracket === 'third')!
    expect(third.round).toBe(3)
    const semis = matches.filter((m) => m.round === 2 && m.bracket === 'main')
    expect(semis.map((s) => s.loser_next_match_id)).toEqual([third.id, third.id])
    expect(semis.map((s) => s.loser_next_slot)).toEqual([1, 2])

    const played = play(matches)
    expect(played.get(third.id)!.status).toBe('completed')
    expect(played.get(third.id)!.winner_id).toBe('e3') // best of the two beaten semi-finalists (e3, e4)

    expect(generateSingleElimination(ids(3), { thirdPlace: true }).some((m) => m.bracket === 'third')).toBe(false)
    expect(generateSingleElimination(ids(4), { thirdPlace: true }).some((m) => m.bracket === 'third')).toBe(true)
  })

  it('carries best_of through and rejects bad fields', () => {
    expect(generateSingleElimination(ids(4), { bestOf: 3 }).every((m) => m.best_of === 3)).toBe(true)
    expect(() => generateSingleElimination(['a'])).toThrow(/at least 2/)
    expect(() => generateSingleElimination([])).toThrow()
    expect(() => generateSingleElimination(['a', 'a'])).toThrow(/Duplicate/)
  })
})

describe('generateRoundRobin', () => {
  it('plays every pair exactly once, and nobody twice in a round, for 2 to 12 entrants', () => {
    for (let n = 2; n <= 12; n++) {
      const matches = generateRoundRobin(ids(n), { newId: counter() })
      expect(matches).toHaveLength((n * (n - 1)) / 2)
      const pairs = matches.map((m) => [m.entrant1_id, m.entrant2_id].sort().join('|'))
      expect(new Set(pairs).size).toBe(pairs.length)
      expect(Math.max(...matches.map((m) => m.round))).toBe(n % 2 === 0 ? n - 1 : n)
      const rounds = new Map<number, string[]>()
      matches.forEach((m) => rounds.set(m.round, [...(rounds.get(m.round) ?? []), m.entrant1_id!, m.entrant2_id!]))
      rounds.forEach((players) => expect(new Set(players).size).toBe(players.length))
      matches.forEach((m) => { expect(m.status).toBe('ready'); expect(m.next_match_id).toBeNull() })
    }
  })
  it('numbers match positions within each round from 1', () => {
    const matches = generateRoundRobin(ids(6), { newId: counter() })
    for (let r = 1; r <= 5; r++) {
      expect(matches.filter((m) => m.round === r).map((m) => m.position)).toEqual([1, 2, 3])
    }
  })
  it('doubleRound adds a return leg with the sides swapped', () => {
    const single = generateRoundRobin(ids(4), { newId: counter() })
    const double = generateRoundRobin(ids(4), { doubleRound: true, newId: counter() })
    expect(double).toHaveLength(single.length * 2)
    expect(Math.max(...double.map((m) => m.round))).toBe(6)
    const first = single[0]
    const returnLeg = double.find((m) => m.round === first.round + 3 && m.entrant1_id === first.entrant2_id && m.entrant2_id === first.entrant1_id)
    expect(returnLeg).toBeTruthy()
  })
})

describe('roundName / shuffle', () => {
  it('names rounds from the final backwards', () => {
    expect([1, 2, 3, 4, 5].map((r) => roundName(r, 5))).toEqual(['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'])
    expect(roundName(3, 3, 'third')).toBe('Third place')
  })
  it('shuffles into a permutation, deterministically for a given rng, without touching the input', () => {
    const input = ids(10)
    let s = 42
    const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
    const a = shuffle(input, rng)
    s = 42
    const b = shuffle(input, rng)
    expect(a).toEqual(b)
    expect(a.slice().sort()).toEqual(input.slice().sort())
    expect(input).toEqual(ids(10))
  })
})

describe('computeStandings', () => {
  const m = (a: string, b: string, s1: number, s2: number, status = 'completed'): StandingMatch => ({
    entrant1_id: a, entrant2_id: b, score1: s1, score2: s2, status,
    winner_id: s1 === s2 ? null : s1 > s2 ? a : b,
  })

  it('starts everyone level, ranked by seed', () => {
    const table = computeStandings(ids(3), [])
    expect(table.map((r) => r.entrant_id)).toEqual(['e1', 'e2', 'e3'])
    expect(table.every((r) => r.points === 0 && r.played === 0)).toBe(true)
  })
  it('awards 3 for a win and 1 for a draw, and counts scores', () => {
    const table = computeStandings(ids(3), [m('e1', 'e2', 2, 0), m('e2', 'e3', 1, 1), m('e1', 'e3', 0, 3)])
    const by = Object.fromEntries(table.map((r) => [r.entrant_id, r]))
    expect(by.e1).toMatchObject({ played: 2, won: 1, lost: 1, points: 3, score_for: 2, score_against: 3, diff: -1 })
    expect(by.e2).toMatchObject({ drawn: 1, lost: 1, points: 1 })
    expect(by.e3).toMatchObject({ won: 1, drawn: 1, points: 4 })
    expect(table.map((r) => r.entrant_id)).toEqual(['e3', 'e1', 'e2'])
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3])
  })
  it('ignores matches that are not completed', () => {
    const table = computeStandings(ids(2), [m('e1', 'e2', 5, 0, 'live'), m('e1', 'e2', 5, 0, 'ready')])
    expect(table.every((r) => r.played === 0)).toBe(true)
  })
  it('breaks a points tie by head-to-head before goal difference', () => {
    // e1 and e2 both finish on 6 points; e2 beat e1, but e1 has the much better score difference
    const table = computeStandings(ids(4), [
      m('e1', 'e2', 0, 1), m('e1', 'e3', 9, 0), m('e1', 'e4', 9, 0),
      m('e2', 'e3', 1, 0), m('e2', 'e4', 0, 1), m('e3', 'e4', 1, 0),
    ])
    expect(table[0].entrant_id).toBe('e2')
    expect(table[1].entrant_id).toBe('e1')
  })
  it('then falls back to score difference, scores for, and finally seed', () => {
    const level = computeStandings(ids(3), [m('e1', 'e2', 1, 1), m('e2', 'e3', 1, 1), m('e1', 'e3', 1, 1)])
    expect(level.map((r) => r.entrant_id)).toEqual(['e1', 'e2', 'e3'])
    const diff = computeStandings(ids(4), [m('e1', 'e2', 1, 0), m('e3', 'e4', 5, 0)])
    expect(diff.slice(0, 2).map((r) => r.entrant_id)).toEqual(['e3', 'e1']) // both 3 points, e3 has +5
  })
  it('handles a three-way tie with a head-to-head mini league', () => {
    // rock-paper-scissors: everyone has 3 points and equal diff -> falls through to seed
    const table = computeStandings(ids(3), [m('e1', 'e2', 1, 0), m('e2', 'e3', 1, 0), m('e3', 'e1', 1, 0)])
    expect(table.map((r) => r.entrant_id)).toEqual(['e1', 'e2', 'e3'])
  })
})
