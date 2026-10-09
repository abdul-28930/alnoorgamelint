import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import { computePrice } from './pricing'
import { toIstString } from './time'

export interface ReceiptBooking {
  id: string
  created_at: string
  start_at?: string | null
  end_at?: string | null
  duration_hours?: number | null
  user_count?: number | null
  total_amount?: number | string | null
  original_amount?: number | string | null
  food_total?: number | string | null
  discount_type?: string | null
  discount_value?: number | string | null
  coupon_code?: string | null
  coupon_discount?: number | string | null
  custom_hourly_rate?: number | string | null
  amount_paid?: number | string | null
  remaining_amount?: number | string | null
  payment_status?: string | null
  payment_method?: string | null
  user_profiles?: { username?: string | null; full_name?: string | null } | null
  stations?: { name?: string | null; type?: string | null; hourly_rate?: number | string | null } | null
}

const num = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const rupees = (v: number) => `₹${Math.round(v)}`

/** Booking times are IST text. Older check-ins stored UTC ISO ("...Z" / "+00:00"), so convert those to IST. */
export function formatIst(value: string | null | undefined): string | null {
  if (!value) return null
  const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
  const ist = hasOffset ? toIstString(new Date(value)) : value.replace('T', ' ')
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(ist)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : null
}

/** What the receipt prints. Total is the stored total_amount (it already includes food; the old receipt added it twice). */
export function receiptLines(b: ReceiptBooking) {
  const rate = num(b.custom_hourly_rate) || num(b.stations?.hourly_rate)
  const hours = num(b.duration_hours)
  const users = num(b.user_count) || 1
  const food = num(b.food_total)
  const total = num(b.total_amount)
  const original = num(b.original_amount)
  const session = original > 0 ? Math.max(0, original - food) : rate * hours * users
  const type = (b.discount_type ?? 'NONE').toUpperCase()
  const value = num(b.discount_value)
  const discount = computePrice({ hourlyRate: 0, durationHours: 1, userCount: 1, foodTotal: session + food, discountType: type, discountValue: value }).discountAmount
  return { rate, hours, users, food, total, session, discount, discountType: type, discountValue: value, coupon: num(b.coupon_discount) }
}

let fonts: { regular: Buffer; bold: Buffer } | undefined
async function loadFonts() {
  if (!fonts) {
    const dir = path.join(process.cwd(), 'server', 'assets', 'fonts')
    const [regular, bold] = await Promise.all([readFile(path.join(dir, 'DejaVuSans.ttf')), readFile(path.join(dir, 'DejaVuSans-Bold.ttf'))])
    fonts = { regular, bold }
  }
  return fonts
}

const BG = rgb(0x1a / 255, 0x1a / 255, 0x2e / 255)
const CYAN = rgb(0, 0xd4 / 255, 1)
const YELLOW = rgb(1, 0xd7 / 255, 0)
const WHITE = rgb(1, 1, 1)
const GRAY = rgb(0x88 / 255, 0x88 / 255, 0x88 / 255)

export async function buildReceiptPdf(b: ReceiptBooking): Promise<Uint8Array> {
  const f = await loadFonts()
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const regular = await doc.embedFont(f.regular, { subset: true })
  const bold = await doc.embedFont(f.bold, { subset: true })
  const page = doc.addPage([612, 792])
  const { width, height } = page.getSize()
  page.drawRectangle({ x: 0, y: 0, width, height, color: BG })

  const text = (s: string, x: number, y: number, font: PDFFont, size: number, color = WHITE) => page.drawText(s, { x, y, font, size, color })
  const centered = (s: string, y: number, font: PDFFont, size: number, color = WHITE) => text(s, (width - font.widthOfTextAtSize(s, size)) / 2, y, font, size, color)
  const right = (s: string, y: number, font: PDFFont, size: number, color = WHITE) => text(s, width - 50 - font.widthOfTextAtSize(s, size), y, font, size, color)
  const line = (y: number) => page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: CYAN })
  const row = (label: string, value: string, y: number, strong = false) => {
    text(label, 50, y, strong ? bold : regular, 10, strong ? WHITE : GRAY)
    right(value, y, strong ? bold : regular, 10, strong ? YELLOW : WHITE)
  }
  const heading = (s: string, y: number) => text(s, 50, y, bold, 11, YELLOW)

  const c = receiptLines(b)
  const customer = b.user_profiles?.full_name || b.user_profiles?.username || 'N/A'
  const station = b.stations ? `${b.stations.name ?? 'N/A'} (${b.stations.type ?? ''})` : 'Not assigned'

  let y = height - 60
  centered('NEO GAMING CAFE', y, bold, 24, YELLOW)
  y -= 25
  centered('- RECEIPT -', y, regular, 12, CYAN)
  y -= 30
  line(y)

  y -= 25
  text(`ID: ${b.id}`, 50, y, regular, 9)
  right(formatIst(b.created_at) ?? '', y, regular, 9)

  y -= 30
  row('Customer', customer, y)
  y -= 18
  row('Station', station, y)
  y -= 25
  line(y)

  y -= 25
  heading('SESSION DETAILS', y)
  y -= 20
  const start = formatIst(b.start_at)
  const end = formatIst(b.end_at)
  if (start) { row('Start', start, y); y -= 18 }
  if (end) { row('End', end, y); y -= 18 }
  row('Duration', `${c.hours} hour(s)`, y)
  y -= 18
  row('Joysticks/Users', String(c.users), y)
  y -= 25
  line(y)

  y -= 25
  heading('CHARGES', y)
  y -= 20
  row('Rate per Hour', rupees(c.rate), y)
  y -= 18
  row('Session Amount', rupees(c.session), y)
  y -= 18
  if (c.food > 0) { row('Food & Snacks', rupees(c.food), y); y -= 18 }
  if (c.discount > 0) {
    row('Discount', `-${c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : rupees(c.discountValue)} (-${rupees(c.discount)})`, y)
    y -= 18
  }
  if (b.coupon_code) { row(`Coupon (${b.coupon_code})`, `-${rupees(c.coupon)}`, y); y -= 18 }
  y -= 10
  line(y)

  y -= 25
  text('TOTAL', 50, y, bold, 14, YELLOW)
  right(rupees(c.total), y, bold, 14, YELLOW)
  y -= 25
  line(y)

  y -= 25
  heading('PAYMENT', y)
  y -= 20
  const paid = num(b.amount_paid)
  const remaining = num(b.remaining_amount)
  row('Amount Paid', rupees(paid), y)
  y -= 18
  if (remaining > 0) { row('Balance Due', rupees(remaining), y, true); y -= 18 }
  else if (remaining < 0) { row('Balance Return', rupees(Math.abs(remaining)), y); y -= 18 }
  row('Status', b.payment_status || 'PENDING', y)
  y -= 18
  if (b.payment_method) row('Method', b.payment_method, y)
  y -= 30
  line(y)

  y -= 30
  centered('Thank you for gaming with us!', y, regular, 10, CYAN)
  y -= 15
  centered('See you again soon!', y, regular, 8, GRAY)

  return doc.save()
}
