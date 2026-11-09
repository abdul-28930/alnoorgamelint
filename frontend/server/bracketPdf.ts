import 'server-only'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { fit } from './entrantsPdf'
import { loadFonts } from './receipt'
import { toIstString } from './time'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface BracketPdfMatch {
  round: number
  position: number
  bracket?: string
  round_name?: string | null
  status: string
  entrant1_id: string | null
  entrant2_id: string | null
  entrant1_name?: string | null
  entrant2_name?: string | null
  score1?: number | null
  score2?: number | null
  winner_id?: string | null
  scheduled_at?: string | null
  console_no?: number | null
}

const INK = rgb(0.08, 0.1, 0.15)
const MUTED = rgb(0.4, 0.43, 0.5)
const RULE = rgb(0.82, 0.84, 0.88)
const ACCENT = rgb(0.03, 0.57, 0.7)
const STRIPE = rgb(0.96, 0.97, 0.98)
const GREEN = rgb(0.09, 0.5, 0.25)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "14 Nov 11:04 · PS5 2" on the café's clock, or an empty string when the match has no time yet. */
export function whenLabel(iso: string | null | undefined, consoleNo: number | null | undefined): string {
  if (!iso) return consoleNo ? `PS5 ${consoleNo}` : ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const ist = toIstString(d)
  return `${Number(ist.slice(8, 10))} ${MONTHS[Number(ist.slice(5, 7)) - 1]} ${ist.slice(11, 16)}${consoleNo ? ` · PS5 ${consoleNo}` : ''}`
}

/** Matches grouped by round, in playing order; the third-place match goes last, before nothing else. */
export function roundsOf(matches: BracketPdfMatch[]): { title: string; matches: BracketPdfMatch[] }[] {
  const main = matches.filter((m) => (m.bracket ?? 'main') !== 'third')
  const third = matches.filter((m) => m.bracket === 'third')
  const rounds = Array.from(new Set(main.map((m) => m.round))).sort((a, b) => a - b)
  const out = rounds.map((r) => {
    const list = main.filter((m) => m.round === r).sort((a, b) => a.position - b.position)
    return { title: list[0]?.round_name || `Round ${r}`, matches: list }
  })
  if (third.length) out.push({ title: 'Third place', matches: third })
  return out
}

/**
 * The bracket as a printable sheet: every round with its matches (players, phone numbers, time and console when planned,
 * result), then the waitlist with phone numbers. `preview` marks a bracket that has not been generated yet.
 */
export async function buildBracketPdf(
  tournament: { name: string; game?: string | null; platform?: string | null },
  matches: BracketPdfMatch[],
  entrants: Row[],
  opts: { preview: boolean; now?: Date },
): Promise<Uint8Array> {
  const f = await loadFonts()
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const regular = await doc.embedFont(f.regular, { subset: true })
  const bold = await doc.embedFont(f.bold, { subset: true })
  doc.setTitle(`${tournament.name} - bracket`)

  const W = 842
  const H = 595
  const M = 36
  const phoneOf = new Map(entrants.map((e) => [e.id as string, (e.phone ?? '') as string]))
  const cols = [
    { x: M, w: 26, head: '#' },
    { x: M + 26, w: 112, head: 'Time / console' },
    { x: M + 138, w: 168, head: 'Player 1' },
    { x: M + 306, w: 82, head: 'Phone' },
    { x: M + 388, w: 168, head: 'Player 2' },
    { x: M + 556, w: 82, head: 'Phone' },
    { x: M + 638, w: 96, head: 'Result' },
  ]
  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0
  const draw = (s: string, x: number, yy: number, font: PDFFont, size: number, color = INK) => {
    try {
      page.drawText(s, { x, y: yy, font, size, color })
    } catch {
      page.drawText(s.replace(/[^\x20-\x7E]/g, '?'), { x, y: yy, font, size, color }) // a script the font lacks must not fail the download
    }
  }
  const head = (labels: { x: number; head: string }[]) => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: STRIPE })
    labels.forEach((c) => draw(c.head, c.x + 2, y, bold, 8.5, MUTED))
    y -= 18
  }
  const newPage = (continued: string | null, labels?: { x: number; head: string }[]) => {
    page = doc.addPage([W, H])
    pages.push(page)
    y = H - M
    if (continued) {
      draw(continued, M, y, bold, 10, ACCENT)
      y -= 18
      if (labels) head(labels)
    }
  }

  newPage(null)
  draw(tournament.name, M, y, bold, 18)
  y -= 20
  const meta = [tournament.game, tournament.platform, opts.preview ? 'BRACKET PREVIEW (not generated yet; the draw may change)' : 'Bracket'].filter(Boolean).join('  ·  ')
  draw(meta, M, y, regular, 9.5, opts.preview ? rgb(0.7, 0.35, 0) : MUTED)
  y -= 8
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: RULE })
  y -= 22

  const name = (n: string | null | undefined, id: string | null, m: BracketPdfMatch) => {
    if (n) return n
    return id ? 'Player' : m.status === 'bye' ? 'BYE' : 'TBD'
  }

  for (const round of roundsOf(matches)) {
    if (y < M + 70) newPage(null)
    draw(`${round.title} (${round.matches.length})`, M, y, bold, 11, ACCENT)
    y -= 18
    head(cols)
    round.matches.forEach((m, i) => {
      if (y < M + 24) newPage(`${round.title} (continued)`, cols)
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 14, color: STRIPE })
      const done = m.status === 'completed' && m.score1 != null && m.score2 != null
      const result = done ? `${m.score1} - ${m.score2}` : m.status === 'completed' ? 'Qualified' : m.status === 'live' ? 'LIVE' : m.status === 'bye' ? 'Bye' : ''
      const p1Won = m.status === 'completed' && !!m.winner_id && m.winner_id === m.entrant1_id
      const p2Won = m.status === 'completed' && !!m.winner_id && m.winner_id === m.entrant2_id
      const cells: [string, PDFFont, ReturnType<typeof rgb>][] = [
        [String(m.position), regular, INK],
        [whenLabel(m.scheduled_at, m.console_no), regular, INK],
        [name(m.entrant1_name, m.entrant1_id, m), p1Won ? bold : regular, m.entrant1_id ? INK : MUTED],
        [m.entrant1_id ? phoneOf.get(m.entrant1_id) || '—' : '', regular, INK],
        [name(m.entrant2_name, m.entrant2_id, m), p2Won ? bold : regular, m.entrant2_id ? INK : MUTED],
        [m.entrant2_id ? phoneOf.get(m.entrant2_id) || '—' : '', regular, INK],
        [result, bold, done ? GREEN : INK],
      ]
      cells.forEach(([text, font, color], k) => draw(fit(text, font, 8.5, cols[k].w - 6), cols[k].x + 2, y, font, 8.5, color))
      y -= 14
    })
    y -= 14
  }

  // the waitlist, in the order places are given out, with phone numbers
  const waiting = entrants
    .filter((e) => e.status === 'waitlist')
    .sort((a, b) => String(a.registered_at ?? '').localeCompare(String(b.registered_at ?? '')))
  const wcols = [
    { x: M, w: 30, head: '#' },
    { x: M + 30, w: 220, head: 'Name' },
    { x: M + 250, w: 110, head: 'Phone' },
    { x: M + 360, w: 220, head: 'Email' },
  ]
  if (y < M + 90) newPage(null)
  draw(`Waitlist (${waiting.length}), in the order places are given out`, M, y, bold, 11, ACCENT)
  y -= 18
  head(wcols)
  if (waiting.length === 0) {
    draw('Nobody is waiting.', M + 2, y, regular, 9, MUTED)
  }
  waiting.forEach((e, i) => {
    if (y < M + 24) newPage('Waitlist (continued)', wcols)
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 14, color: STRIPE })
    const cells = [String(i + 1), String(e.display_name ?? ''), String(e.phone ?? '—'), String(e.email ?? '—')]
    cells.forEach((cell, k) => draw(fit(cell, k === 1 ? bold : regular, 8.5, wcols[k].w - 6), wcols[k].x + 2, y, k === 1 ? bold : regular, 8.5))
    y -= 14
  })

  const stamp = `Generated ${toIstString(opts.now ?? new Date()).slice(0, 16)} IST`
  pages.forEach((p, i) => {
    page = p
    draw(stamp, M, 20, regular, 8, MUTED)
    const t = `Page ${i + 1} of ${pages.length}`
    draw(t, W - M - regular.widthOfTextAtSize(t, 8), 20, regular, 8, MUTED)
  })
  return doc.save()
}
