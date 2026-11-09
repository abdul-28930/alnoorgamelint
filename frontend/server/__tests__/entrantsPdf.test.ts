import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildEntrantsPdf, fit, sectionsFor } from '../entrantsPdf'

const e = (n: number, status: string, extra: object = {}) => ({ id: `e${n}`, display_name: `Player ${n}`, status, registered_at: String(1000 + n), phone: `98765${String(n).padStart(5, '0')}`, email: null, ...extra })
const T = { name: 'NEO RIFT - EAFC SEASON 1', game: 'EAFC', platform: 'PS5', starts_at: '2026-11-14T05:30:00Z', max_players: 128 }

describe('sectionsFor', () => {
  const all = [e(3, 'waitlist'), e(1, 'registered'), e(2, 'checked_in'), e(5, 'withdrawn'), e(4, 'waitlist'), e(6, 'disqualified')]
  it('puts registered first, then the waitlist oldest first, and leaves out people who are out by default', () => {
    const s = sectionsFor(all, 'active')
    expect(s.map((x) => x.rows.map((r) => r.id))).toEqual([['e1', 'e2'], ['e3', 'e4']])
    expect(s[1].showPosition).toBe(true)
  })
  it('can be only the registered, only the waitlist, or everyone', () => {
    expect(sectionsFor(all, 'registered')).toHaveLength(1)
    expect(sectionsFor(all, 'waitlist').map((x) => x.rows.length)).toEqual([2])
    expect(sectionsFor(all, 'all').map((x) => x.rows.length)).toEqual([2, 2, 2])
  })
})

describe('sectionsFor, A to Z', () => {
  const named = [
    { id: 'a', status: 'registered', registered_at: '1', display_name: 'sameer' },
    { id: 'b', status: 'registered', registered_at: '2', display_name: 'Abdul' },
    { id: 'c', status: 'waitlist', registered_at: '3', display_name: 'Zaid' },
    { id: 'd', status: 'waitlist', registered_at: '4', display_name: 'Aslam' },
  ]
  it('sorts names ignoring capitals, in each section', () => {
    const s = sectionsFor(named, 'active', 'name')
    expect(s[0].rows.map((r) => r.display_name)).toEqual(['Abdul', 'sameer'])
    expect(s[1].rows.map((r) => r.display_name)).toEqual(['Aslam', 'Zaid'])
  })
  it('keeps each waiting player\'s true place in the queue', () => {
    const s = sectionsFor(named, 'waitlist', 'name')
    expect(s[0].rows.map((r) => [r.display_name, r.waitlist_position])).toEqual([['Aslam', 2], ['Zaid', 1]])
  })
  it('registration order is the default', () => {
    expect(sectionsFor(named, 'registered')[0].rows.map((r) => r.display_name)).toEqual(['sameer', 'Abdul'])
  })
  it('still makes the PDF', async () => {
    const pdf = await buildEntrantsPdf(T, named, 'active', new Date(), 'name')
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
  })
})

describe('fit', () => {
  const font = { widthOfTextAtSize: (t: string) => t.length * 10 }
  it('leaves short text alone and cuts long text with an ellipsis', () => {
    expect(fit('abc', font, 8, 100)).toBe('abc')
    expect(fit('abcdefghijklmnop', font, 8, 60)).toBe('abcde…')
  })
})

describe('buildEntrantsPdf', () => {
  it('makes a multi-page PDF for a few hundred players', async () => {
    const rows = [...Array.from({ length: 128 }, (_, i) => e(i, 'registered', { email: `p${i}@example.com`, no_show: i === 3 })), ...Array.from({ length: 70 }, (_, i) => e(200 + i, 'waitlist'))]
    const pdf = await buildEntrantsPdf(T, rows, 'active', new Date('2026-11-08T05:00:00Z'))
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(5000)
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(4)
  })
  it('does not fail on names the font cannot draw, or on an empty list', async () => {
    const pdf = await buildEntrantsPdf(T, [e(1, 'registered', { display_name: 'தமிழ் 🎮 Raj' })], 'all')
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
    expect((await buildEntrantsPdf(T, [], 'active')).length).toBeGreaterThan(1000)
  })
})
