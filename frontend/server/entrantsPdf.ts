import 'server-only'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { loadFonts } from './receipt'
import { toIstString } from './time'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export type EntrantList = 'registered' | 'waitlist' | 'active' | 'all'
export const entrantLists: EntrantList[] = ['registered', 'waitlist', 'active', 'all']

const PLAYING = ['registered', 'checked_in']

export interface PdfSection { title: string; rows: Row[]; showPosition?: boolean }

/** Which people go on the sheet, in the order staff expect: registered, then the waitlist (oldest first), then anyone out. */
export function sectionsFor(entrants: Row[], list: EntrantList): PdfSection[] {
  const byTime = (a: Row, b: Row) => String(a.registered_at ?? '').localeCompare(String(b.registered_at ?? ''))
  const playing = entrants.filter((e) => PLAYING.includes(e.status)).sort(byTime)
  const waiting = entrants.filter((e) => e.status === 'waitlist').sort(byTime)
  const out = entrants.filter((e) => ['withdrawn', 'disqualified'].includes(e.status)).sort(byTime)
  const sections: PdfSection[] = []
  if (list !== 'waitlist') sections.push({ title: 'Registered players', rows: playing })
  if (list !== 'registered') sections.push({ title: 'Waitlist (in the order places are given out)', rows: waiting, showPosition: true })
  if (list === 'all') sections.push({ title: 'Withdrawn or disqualified', rows: out })
  return sections
}

const INK = rgb(0.08, 0.1, 0.15)
const MUTED = rgb(0.4, 0.43, 0.5)
const RULE = rgb(0.82, 0.84, 0.88)
const ACCENT = rgb(0.03, 0.57, 0.7)
const STRIPE = rgb(0.96, 0.97, 0.98)

/** Cuts text to a width, adding "…". */
export function fit(text: string, font: Pick<PDFFont, 'widthOfTextAtSize'>, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

const label = (e: Row) => (e.status === 'checked_in' ? 'Checked in' : e.status === 'registered' ? 'Registered' : e.status === 'waitlist' ? 'Waitlist' : e.status === 'disqualified' ? 'Disqualified' : 'Withdrawn')

export async function buildEntrantsPdf(
  tournament: { name: string; game?: string | null; platform?: string | null; starts_at?: string | null; max_players?: number | null },
  entrants: Row[],
  list: EntrantList,
  now: Date = new Date(),
): Promise<Uint8Array> {
  const f = await loadFonts()
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const regular = await doc.embedFont(f.regular, { subset: true })
  const bold = await doc.embedFont(f.bold, { subset: true })
  doc.setTitle(`${tournament.name} - players`)

  const W = 595
  const H = 842
  const M = 40
  // # | name | phone | email | status
  const cols = [
    { x: M, w: 30, head: '#' },
    { x: M + 30, w: 150, head: 'Name' },
    { x: M + 180, w: 90, head: 'Phone' },
    { x: M + 270, w: 170, head: 'Email' },
    { x: M + 440, w: 75, head: 'Status' },
  ]
  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0
  // text that the font cannot draw (some scripts) falls back to what it can, instead of failing the whole download
  const draw = (s: string, x: number, yy: number, font: PDFFont, size: number, color = INK) => {
    try {
      page.drawText(s, { x, y: yy, font, size, color })
    } catch {
      page.drawText(s.replace(/[^\x20-\x7E]/g, '?'), { x, y: yy, font, size, color })
    }
  }
  const header = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: STRIPE })
    cols.forEach((c) => draw(c.head, c.x + 2, y, bold, 8.5, MUTED))
    y -= 18
  }
  const newPage = (continued: string | null) => {
    page = doc.addPage([W, H])
    pages.push(page)
    y = H - M
    if (continued) {
      draw(continued, M, y, bold, 10, ACCENT)
      y -= 18
      header()
    }
  }

  newPage(null)
  draw(tournament.name, M, y, bold, 18)
  y -= 20
  const when = tournament.starts_at ? toIstString(new Date(tournament.starts_at)).slice(0, 16) : null
  const meta = [tournament.game, tournament.platform, when ? `Starts ${when} IST` : null].filter(Boolean).join('  ·  ')
  if (meta) { draw(meta, M, y, regular, 9.5, MUTED); y -= 14 }

  const sections = sectionsFor(entrants, list)
  const counts = sections.map((s) => `${s.rows.length} ${s.title.split(' (')[0].toLowerCase()}`).join('  ·  ')
  draw(counts + (tournament.max_players ? `  ·  max ${tournament.max_players}` : ''), M, y, regular, 9.5, MUTED)
  y -= 8
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: RULE })
  y -= 22

  for (const section of sections) {
    if (y < M + 80) newPage(null)
    draw(`${section.title} (${section.rows.length})`, M, y, bold, 11, ACCENT)
    y -= 18
    header()
    if (section.rows.length === 0) {
      draw('Nobody here.', M + 2, y, regular, 9, MUTED)
      y -= 22
      continue
    }
    section.rows.forEach((e, i) => {
      if (y < M + 24) {
        newPage(`${section.title} (continued)`)
      }
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 14, color: STRIPE })
      const status = e.no_show ? 'No-show' : label(e)
      const cells = [String(i + 1), String(e.display_name ?? ''), String(e.phone ?? '—'), String(e.email ?? '—'), section.showPosition ? `Waitlist ${i + 1}` : status]
      cells.forEach((cell, k) => draw(fit(cell, regular, 8.5, cols[k].w - 6), cols[k].x + 2, y, k === 1 ? bold : regular, 8.5))
      y -= 14
    })
    y -= 14
  }

  const stamp = `Generated ${toIstString(now).slice(0, 16)} IST`
  pages.forEach((p, i) => {
    page = p
    draw(stamp, M, 22, regular, 8, MUTED)
    const t = `Page ${i + 1} of ${pages.length}`
    draw(t, W - M - regular.widthOfTextAtSize(t, 8), 22, regular, 8, MUTED)
  })
  return doc.save()
}
