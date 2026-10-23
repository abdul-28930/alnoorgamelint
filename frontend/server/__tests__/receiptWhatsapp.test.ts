import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fakeDb, type Call } from './fakeDb'
import { maskPhone, sendReceiptOnWhatsapp } from '../services/receiptWhatsapp'

const cfg = { licenseNumber: 'L1', apiKey: 'K1', baseUrl: 'https://wa.test/api' }
const has = (c: Call[], m: string) => c.some((x) => x.method === m)
const ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const urls = (f: unknown) => (f as { mock: { calls: [URL][] } }).mock.calls.map((c) => c[0])
const okFetch = () => vi.fn(async () => new Response('{"status":"success"}')) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const pdf = async () => new Uint8Array([37, 80, 68, 70])

const BOOKING = { id: ID, user_id: 'u1', status: 'ENDED', checked_in_at: '2026-10-31T10:00:00Z', start_at: '2026-10-31 15:30:00', end_at: '2026-10-31 16:30:00', start_time: '15:30', checked_in: true, total_amount: 150, guest_phone: null, guest_name: null, user_profiles: { username: 'rahul', full_name: 'Rahul' } }

function world(over: { booking?: object | null; phone?: string | null; existing?: object | null; storeError?: object | null; signError?: object | null } = {}) {
  const uploads: { path: string; type?: string }[] = []
  const base = fakeDb({
    tables: {
      bookings: { data: 'booking' in over ? over.booking : BOOKING },
      user_profiles: { data: { phone: 'phone' in over ? over.phone : '98765 43210' } },
      whatsapp_templates: { data: { template_name: 'receipt_ready', enabled: true } },
      notification_log: (c: Call[]) => (has(c, 'insert') && has(c, 'select') ? { data: { id: 'n1', attempts: 0 } } : has(c, 'maybeSingle') ? { data: over.existing ?? null } : {}),
    },
  })
  const storage = {
    from: () => ({
      upload: (path: string, _b: unknown, o: { contentType: string }) => { uploads.push({ path, type: o.contentType }); return Promise.resolve({ error: over.storeError ?? null }) },
      createSignedUrl: (path: string) => Promise.resolve(over.signError ? { data: null, error: over.signError } : { data: { signedUrl: `https://files.test/signed/${path}?token=abc` }, error: null }),
    }),
  }
  const db = { from: (t: string) => (base.db as any).from(t), storage } as unknown as SupabaseClient // eslint-disable-line @typescript-eslint/no-explicit-any
  return { db, uploads, log: base.log }
}

describe('sendReceiptOnWhatsapp', () => {
  it('stores the receipt privately, sends a temporary link, and says where it went', async () => {
    const w = world()
    const f = okFetch()
    const out = await sendReceiptOnWhatsapp(ID, {}, 'staff1', w.db, { cfg, fetchImpl: f, pdf })
    expect(out).toEqual({ status: 'sent', sent_to: '••••3210', detail: undefined })
    expect(w.uploads).toHaveLength(1)
    expect(w.uploads[0].path).toMatch(new RegExp(`^${ID}/receipt-\\d+\\.pdf$`))
    expect(w.uploads[0].type).toBe('application/pdf')
    const u = urls(f)[0]
    expect(u.searchParams.get('Template')).toBe('receipt_ready')
    expect(u.searchParams.get('Contact')).toBe('919876543210')
    expect(u.searchParams.get('Param')).toBe('Rahul,NGCA1B2C3,150')
    expect(u.searchParams.get('Fileurl')).toContain('https://files.test/signed/')
    expect(u.searchParams.get('PDFName')).toBe('Receipt-NGCA1B2C3.pdf')
    const row = w.log.find((e) => e.table === 'notification_log' && has(e.calls, 'insert') && has(e.calls, 'select'))!.calls.find((c) => c.method === 'insert')!.args[0]
    expect(row).toMatchObject({ event: 'receipt_ready', booking_id: ID, sent_by: 'staff1' })
  })
  it('sends to a number staff typed instead, and checks it', async () => {
    const f = okFetch()
    await sendReceiptOnWhatsapp(ID, { phone: '91234 56789' }, 's', world().db, { cfg, fetchImpl: f, pdf })
    expect(urls(f)[0].searchParams.get('Contact')).toBe('919123456789')
    await expect(sendReceiptOnWhatsapp(ID, { phone: '12345' }, 's', world().db, { cfg, fetchImpl: f, pdf })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('not a valid') })
  })
  it('uses a walk-in guest\'s own number, and asks for one when there is none', async () => {
    const f = okFetch()
    const guest = { ...BOOKING, user_id: null, guest_phone: '9988776655', guest_name: 'Arjun', user_profiles: null }
    await sendReceiptOnWhatsapp(ID, {}, 's', world({ booking: guest }).db, { cfg, fetchImpl: f, pdf })
    expect(urls(f)[0].searchParams.get('Contact')).toBe('919988776655')
    expect(urls(f)[0].searchParams.get('Param')).toContain('Arjun')
    await expect(sendReceiptOnWhatsapp(ID, {}, 's', world({ booking: { ...guest, guest_phone: null } }).db, { cfg, pdf })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Type one') })
    await expect(sendReceiptOnWhatsapp(ID, {}, 's', world({ phone: null }).db, { cfg, pdf })).rejects.toMatchObject({ status: 400 })
  })
  it('sends once if pressed twice within 10 minutes, without making a second file', async () => {
    const w = world({ existing: { id: 'n0' } })
    const f = okFetch()
    const out = await sendReceiptOnWhatsapp(ID, {}, 's', w.db, { cfg, fetchImpl: f, pdf })
    expect(out.status).toBe('duplicate')
    expect(w.uploads).toHaveLength(0)
    expect(f).not.toHaveBeenCalled()
  })
  it('explains setup problems instead of failing mysteriously', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendReceiptOnWhatsapp(ID, {}, 's', world().db, { cfg: null, pdf })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('not configured') })
    await expect(sendReceiptOnWhatsapp(ID, {}, 's', world({ storeError: { message: 'Bucket not found' } }).db, { cfg, pdf })).rejects.toMatchObject({ status: 500, message: expect.stringContaining('14_receipts_bucket.sql') })
    await expect(sendReceiptOnWhatsapp(ID, {}, 's', world({ signError: { message: 'x' } }).db, { cfg, pdf })).rejects.toMatchObject({ status: 500 })
  })
  it('refuses a booking that cannot have a receipt yet, or does not exist', async () => {
    await expect(sendReceiptOnWhatsapp(ID, {}, 's', world({ booking: { ...BOOKING, status: 'UPCOMING', checked_in_at: null, start_at: '2999-01-01 10:00:00', end_at: '2999-01-01 11:00:00', checked_in: false } }).db, { cfg, pdf })).rejects.toMatchObject({ status: 400 })
    await expect(sendReceiptOnWhatsapp(ID, {}, 's', world({ booking: null }).db, { cfg, pdf })).rejects.toMatchObject({ status: 404 })
  })
  it('hides all but the last four digits', () => {
    expect(maskPhone('919876543210')).toBe('••••3210')
  })
})
