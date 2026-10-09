/**
 * Tournament format logic. Pure functions: no database, no clock, no randomness unless injected, so every
 * rule here is unit-tested. The database keeps the result of this (matches linked by next_match_id) and
 * advances winners with the SQL functions in sql/setup/08_tournaments.sql, which follow the same links.
 *
 * "Entrant" = whatever is playing: one player, or one team. Everything below works on entrant ids.
 */

export type MatchStatus = 'pending' | 'ready' | 'live' | 'completed' | 'bye'
export type BracketKind = 'main' | 'third'

export interface GeneratedMatch {
  id: string
  round: number
  /** 1-based position inside the round. */
  position: number
  bracket: BracketKind
  entrant1_id: string | null
  entrant2_id: string | null
  /** The match the winner moves into, and which side of it (1 or 2). Null for finals and round-robin matches. */
  next_match_id: string | null
  next_slot: 1 | 2 | null
  /** Where the loser goes (only the semi-finals when a third-place match is played). */
  loser_next_match_id: string | null
  loser_next_slot: 1 | 2 | null
  status: MatchStatus
  /** Set at generation only for byes. */
  winner_id: string | null
  best_of: number
}

export interface GenerateOptions {
  bestOf?: number
  newId?: () => string
}

const defaultNewId = () => globalThis.crypto.randomUUID()

export const VALID_BEST_OF = [1, 3, 5, 7]

function assertEntrants(ids: string[]) {
  if (ids.length < 2) throw new Error('A tournament needs at least 2 entrants')
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate entrant')
}

/**
 * Seed numbers in bracket order for a power-of-two bracket, so seed 1 and 2 can only meet in the final,
 * 1-4 only in the semi-finals, and so on: size 8 -> [1,8,4,5,2,7,3,6].
 */
export function seedOrder(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) throw new Error('size must be a power of two')
  let order = [1]
  while (order.length < size) {
    const total = order.length * 2
    order = order.flatMap((seed) => [seed, total + 1 - seed])
  }
  return order
}

export function nextPowerOfTwo(n: number): number {
  let size = 1
  while (size < n) size *= 2
  return size
}

/** Deterministic Fisher-Yates shuffle; pass a seeded rng in tests, Math.random in production. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Single elimination. `entrantIds` must already be in seed order (index 0 = seed 1). When the field is not a
 * power of two the top seeds get byes; a bye is stored as a match (so the bracket still draws) with its winner
 * already placed in the next round.
 */
export function generateSingleElimination(
  entrantIds: string[],
  opts: GenerateOptions & { thirdPlace?: boolean } = {},
): GeneratedMatch[] {
  assertEntrants(entrantIds)
  const newId = opts.newId ?? defaultNewId
  const bestOf = opts.bestOf ?? 1
  const n = entrantIds.length
  const size = nextPowerOfTwo(n)
  const rounds = Math.log2(size)

  const slots = seedOrder(size).map((seed) => (seed <= n ? entrantIds[seed - 1] : null))

  const byRound: GeneratedMatch[][] = []
  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round
    byRound.push(
      Array.from({ length: count }, (_, i) => ({
        id: newId(),
        round,
        position: i + 1,
        bracket: 'main' as const,
        entrant1_id: round === 1 ? slots[2 * i] : null,
        entrant2_id: round === 1 ? slots[2 * i + 1] : null,
        next_match_id: null,
        next_slot: null,
        loser_next_match_id: null,
        loser_next_slot: null,
        status: 'pending' as MatchStatus,
        winner_id: null,
        best_of: bestOf,
      })),
    )
  }

  // winner links
  for (let r = 0; r < rounds - 1; r++) {
    byRound[r].forEach((match, i) => {
      const next = byRound[r + 1][Math.floor(i / 2)]
      match.next_match_id = next.id
      match.next_slot = (i % 2 === 0 ? 1 : 2) as 1 | 2
    })
  }

  const all = byRound.flat()
  const byId = new Map(all.map((m) => [m.id, m]))

  // byes: a first-round match with one empty side advances the other entrant straight away
  for (const match of byRound[0]) {
    if (match.entrant1_id && match.entrant2_id) {
      match.status = 'ready'
    } else {
      match.status = 'bye'
      match.winner_id = match.entrant1_id ?? match.entrant2_id
      if (match.next_match_id && match.next_slot) {
        const next = byId.get(match.next_match_id)!
        if (match.next_slot === 1) next.entrant1_id = match.winner_id
        else next.entrant2_id = match.winner_id
      }
    }
  }
  for (const match of all) {
    if (match.status === 'pending' && match.entrant1_id && match.entrant2_id) match.status = 'ready'
  }

  // third-place match between the semi-final losers (needs real semi-finals, so at least 4 entrants)
  if (opts.thirdPlace && n >= 4 && rounds >= 2) {
    const semis = byRound[rounds - 2]
    const third: GeneratedMatch = {
      id: newId(),
      round: rounds,
      position: 2,
      bracket: 'third',
      entrant1_id: null,
      entrant2_id: null,
      next_match_id: null,
      next_slot: null,
      loser_next_match_id: null,
      loser_next_slot: null,
      status: 'pending',
      winner_id: null,
      best_of: bestOf,
    }
    semis.forEach((semi, i) => {
      semi.loser_next_match_id = third.id
      semi.loser_next_slot = (i === 0 ? 1 : 2) as 1 | 2
    })
    all.push(third)
  }
  return all
}

/**
 * Round robin (everyone plays everyone) with the circle method: each round every entrant plays at most once,
 * odd fields get one rest per round. `doubleRound` adds a return leg with the sides swapped.
 */
export function generateRoundRobin(
  entrantIds: string[],
  opts: GenerateOptions & { doubleRound?: boolean } = {},
): GeneratedMatch[] {
  assertEntrants(entrantIds)
  const newId = opts.newId ?? defaultNewId
  const bestOf = opts.bestOf ?? 1

  const ring: (string | null)[] = entrantIds.slice()
  if (ring.length % 2 === 1) ring.push(null) // the entrant paired with null rests
  const m = ring.length
  const legRounds = m - 1

  const make = (round: number, position: number, a: string, b: string): GeneratedMatch => ({
    id: newId(),
    round,
    position,
    bracket: 'main',
    entrant1_id: a,
    entrant2_id: b,
    next_match_id: null,
    next_slot: null,
    loser_next_match_id: null,
    loser_next_slot: null,
    status: 'ready',
    winner_id: null,
    best_of: bestOf,
  })

  const firstLeg: { round: number; a: string; b: string }[] = []
  let rotating = ring.slice()
  for (let r = 0; r < legRounds; r++) {
    for (let i = 0; i < m / 2; i++) {
      let a = rotating[i]
      let b = rotating[m - 1 - i]
      if (!a || !b) continue
      if (i === 0 && r % 2 === 1) [a, b] = [b, a] // alternate who is listed first
      firstLeg.push({ round: r + 1, a, b })
    }
    // keep the first entrant fixed, rotate the others
    rotating = [rotating[0], rotating[m - 1], ...rotating.slice(1, m - 1)]
  }

  const matches: GeneratedMatch[] = []
  const positions = new Map<number, number>()
  const add = (round: number, a: string, b: string) => {
    const pos = (positions.get(round) ?? 0) + 1
    positions.set(round, pos)
    matches.push(make(round, pos, a, b))
  }
  firstLeg.forEach(({ round, a, b }) => add(round, a, b))
  if (opts.doubleRound) firstLeg.forEach(({ round, a, b }) => add(round + legRounds, b, a))
  return matches
}

/** "Final", "Semi-final", "Quarter-final", "Round of 16", ... for single-elimination rounds. */
export function roundName(round: number, totalRounds: number, bracket: BracketKind = 'main'): string {
  if (bracket === 'third') return 'Third place'
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-final'
  if (fromEnd === 2) return 'Quarter-final'
  return `Round of ${2 ** (fromEnd + 1)}`
}

export function totalRounds(matches: Pick<GeneratedMatch, 'round' | 'bracket'>[]): number {
  return matches.reduce((max, m) => (m.bracket === 'main' ? Math.max(max, m.round) : max), 0)
}

// ---- standings (round robin) ------------------------------------------------------------------

export interface StandingMatch {
  entrant1_id: string | null
  entrant2_id: string | null
  score1: number | null
  score2: number | null
  winner_id: string | null
  status: MatchStatus | string
}

export interface StandingRow {
  entrant_id: string
  rank: number
  played: number
  won: number
  drawn: number
  lost: number
  points: number
  score_for: number
  score_against: number
  diff: number
}

export const POINTS = { win: 3, draw: 1, loss: 0 } as const

/**
 * League table. Order: points, then head-to-head points among the tied entrants, then score difference,
 * then scores for, then seed (the order of `entrantIds`). Draws are a completed match with no winner.
 */
export function computeStandings(entrantIds: string[], matches: StandingMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    entrantIds.map((id) => [id, { entrant_id: id, rank: 0, played: 0, won: 0, drawn: 0, lost: 0, points: 0, score_for: 0, score_against: 0, diff: 0 }]),
  )
  const done = matches.filter((m) => m.status === 'completed' && m.entrant1_id && m.entrant2_id)

  for (const m of done) {
    const a = rows.get(m.entrant1_id!)
    const b = rows.get(m.entrant2_id!)
    if (!a || !b) continue
    const s1 = m.score1 ?? 0
    const s2 = m.score2 ?? 0
    a.played++; b.played++
    a.score_for += s1; a.score_against += s2
    b.score_for += s2; b.score_against += s1
    if (m.winner_id === a.entrant_id) { a.won++; b.lost++; a.points += POINTS.win; b.points += POINTS.loss }
    else if (m.winner_id === b.entrant_id) { b.won++; a.lost++; b.points += POINTS.win; a.points += POINTS.loss }
    else { a.drawn++; b.drawn++; a.points += POINTS.draw; b.points += POINTS.draw }
  }
  rows.forEach((r) => { r.diff = r.score_for - r.score_against })

  const seed = new Map(entrantIds.map((id, i) => [id, i]))
  const list = Array.from(rows.values())

  // head-to-head points between a set of tied entrants
  const headToHead = (tied: string[]): Map<string, number> => {
    const set = new Set(tied)
    const pts = new Map(tied.map((id) => [id, 0]))
    for (const m of done) {
      if (!set.has(m.entrant1_id!) || !set.has(m.entrant2_id!)) continue
      if (m.winner_id) pts.set(m.winner_id, (pts.get(m.winner_id) ?? 0) + POINTS.win)
      else { pts.set(m.entrant1_id!, (pts.get(m.entrant1_id!) ?? 0) + POINTS.draw); pts.set(m.entrant2_id!, (pts.get(m.entrant2_id!) ?? 0) + POINTS.draw) }
    }
    return pts
  }

  const sorted: StandingRow[] = []
  const byPoints = new Map<number, StandingRow[]>()
  list.forEach((r) => byPoints.set(r.points, [...(byPoints.get(r.points) ?? []), r]))
  Array.from(byPoints.keys()).sort((x, y) => y - x).forEach((pts) => {
    const group = byPoints.get(pts)!
    const h2h = group.length > 1 ? headToHead(group.map((r) => r.entrant_id)) : new Map<string, number>()
    group.sort((x, y) =>
      (h2h.get(y.entrant_id) ?? 0) - (h2h.get(x.entrant_id) ?? 0) ||
      y.diff - x.diff ||
      y.score_for - x.score_for ||
      seed.get(x.entrant_id)! - seed.get(y.entrant_id)!)
    sorted.push(...group)
  })
  sorted.forEach((r, i) => { r.rank = i + 1 })
  return sorted
}
