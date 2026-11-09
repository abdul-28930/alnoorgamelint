import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildBracketPdf, roundsOf, whenLabel, type BracketPdfMatch } from '../bracketPdf'

const T = { name: 'NEO RIFT - EAFC SEASON 1', game: 'EAFC', platform: 'PS5' }
const ents = Array.from({ length: 64 }, (_, i) => ({ id: `e${i + 1}`, display_name: `Player ${i + 1}`, phone: `98765${String(i).padStart(5, '0')}`, status: 'registered', registered_at: String(i) }))
const wait = Array.from({ length: 12 }, (_, i) => ({ id: `w${i + 1}`, display_name: `Waiting ${i + 1}`, phone: `99999${String(i).padStart(5, '0')}`, email: i % 2 ? `w${i}@x.com` : null, status: 'waitlist', registered_at: String(100 + i) }))
const round1: BracketPdfMatch[] = Array.from({ length: 32 }, (_, i) => ({
  round: 1, position: i + 1, bracket: 'main', round_name: 'Round of 64', status: i === 0 ? 'completed' : 'ready', entrant1_id: `e${2 * i + 1}`, entrant2_id: `e${2 * i + 2}`,
  entrant1_name: `Player ${2 * i + 1}`, entrant2_name: `Player ${2 * i + 2}`, score1: i === 0 ? 3 : null, score2: i === 0 ? 1 : null, winner_id: i === 0 ? 'e1' : null,
  scheduled_at: '2026-11-14T05:30:00Z', console_no: (i % 4) + 1,
}))
const later: BracketPdfMatch[] = [
  { round: 2, position: 1, bracket: 'main', round_name: 'Round of 32', status: 'pending', entrant1_id: null, entrant2_id: null },
  { round: 6, position: 1, bracket: 'main', round_name: 'Final', status: 'pending', entrant1_id: null, entrant2_id: null },
  { round: 6, position: 1, bracket: 'third', round_name: 'Third place', status: 'pending', entrant1_id: null, entrant2_id: null },
]

describe('whenLabel', () => {
  it('shows the café clock and the console', () => {
    expect(whenLabel('2026-11-14T05:30:00Z', 2)).toBe('14 Nov 11:00 · PS5 2')
    expect(whenLabel(null, 3)).toBe('PS5 3')
    expect(whenLabel(null, null)).toBe('')
    expect(whenLabel('nonsense', 1)).toBe('')
  })
})

describe('roundsOf', () => {
  it('groups by round in order and puts third place last', () => {
    const r = roundsOf([...later, ...round1])
    expect(r.map((x) => x.title)).toEqual(['Round of 64', 'Round of 32', 'Final', 'Third place'])
    expect(r[0].matches.map((m) => m.position).slice(0, 3)).toEqual([1, 2, 3])
  })
})

describe('buildBracketPdf', () => {
  it('makes a multi-page landscape sheet with the waitlist', async () => {
    const pdf = await buildBracketPdf(T, [...round1, ...later], [...ents, ...wait], { preview: false, now: new Date('2026-11-10T05:00:00Z') })
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(doc.getPage(0).getSize()).toEqual({ width: 842, height: 595 })
  })
  it('marks a preview, and copes with byes, unknown players and names the font cannot draw', async () => {
    const odd: BracketPdfMatch[] = [
      { round: 1, position: 1, bracket: 'main', round_name: 'Quarter-final', status: 'bye', entrant1_id: 'e1', entrant2_id: null, entrant1_name: 'தமிழ் 🎮 Raj' },
      { round: 1, position: 2, bracket: 'main', round_name: 'Quarter-final', status: 'ready', entrant1_id: 'e2', entrant2_id: 'e3', entrant1_name: null, entrant2_name: 'Sam' },
    ]
    const pdf = await buildBracketPdf(T, odd, ents, { preview: true })
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
    expect((await buildBracketPdf(T, [], [], { preview: true })).length).toBeGreaterThan(1000)
  })
})
