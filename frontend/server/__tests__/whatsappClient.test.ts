import { describe, expect, it } from 'vitest'
import { buildSendUrl, checkAccount, cleanParam, interpretResponse, normalizePhone, sendTemplate } from '../whatsapp/client'

const cfg = { licenseNumber: '96594828442', apiKey: 'SECRETKEY123', baseUrl: 'https://login.tendigit.in/api' }

describe('normalizePhone', () => {
  it('turns common Indian formats into 91XXXXXXXXXX', () => {
    for (const raw of ['9876543210', '98765 43210', '+91 98765-43210', '09876543210', '919876543210', ' 98765 43210 ']) {
      expect(normalizePhone(raw)).toBe('919876543210')
    }
  })
  it('refuses numbers that cannot be a mobile', () => {
    for (const raw of ['', null, undefined, '12345', '1234567890', '0112345678', '919876543', '9198765432100', 'abc']) {
      expect(normalizePhone(raw as string)).toBeNull()
    }
  })
})

describe('cleanParam', () => {
  it('makes every value one tidy line the template can take', () => {
    expect(cleanParam('Round 1,\nRound  2')).toBe('Round 1 Round 2')
    expect(cleanParam('  a\t\tb  ')).toBe('a b')
    expect(cleanParam(150)).toBe('150')
    expect(cleanParam('')).toBe('-')
    expect(cleanParam(null)).toBe('-')
    expect(cleanParam('x'.repeat(500))).toHaveLength(200)
  })
})

describe('buildSendUrl', () => {
  it('builds the send-template call with the variables comma-separated and everything encoded', () => {
    const url = buildSendUrl(cfg, { contact: '919876543210', template: 'booking_confirmed', params: ['Rahul K', 'Omega s3', '₹150, cash'], name: 'Rahul' })
    expect(url.origin + url.pathname).toBe('https://login.tendigit.in/api/sendtemplate.php')
    expect(url.searchParams.get('Contact')).toBe('919876543210')
    expect(url.searchParams.get('Template')).toBe('booking_confirmed')
    expect(url.searchParams.get('Param')).toBe('Rahul K,Omega s3,₹150 cash') // the comma inside a value cannot split it
    expect(url.searchParams.get('Name')).toBe('Rahul')
    expect(url.searchParams.has('URLParam')).toBe(false)
    expect(url.searchParams.has('Fileurl')).toBe(false)
  })
  it('adds the button link and the document only when given', () => {
    const url = buildSendUrl(cfg, { contact: '919876543210', template: 't', params: ['a'], urlParam: 'abc-123', fileUrl: 'https://x.test/r.pdf', pdfName: 'Receipt.pdf' })
    expect(url.searchParams.get('URLParam')).toBe('abc-123')
    expect(url.searchParams.get('Fileurl')).toBe('https://x.test/r.pdf')
    expect(url.searchParams.get('PDFName')).toBe('Receipt.pdf')
  })
})

describe('interpretResponse', () => {
  it('reads clear successes and clear failures', () => {
    expect(interpretResponse(true, '{"status":"success","messageid":"abc"}').outcome).toBe('sent')
    expect(interpretResponse(true, '{"success":true}').outcome).toBe('sent')
    expect(interpretResponse(true, 'Message submitted successfully').outcome).toBe('sent')
    expect(interpretResponse(true, '{"status":"error","message":"Invalid template"}').outcome).toBe('failed')
    expect(interpretResponse(true, '{"success":false}').outcome).toBe('failed')
    expect(interpretResponse(true, 'Invalid license number').outcome).toBe('failed')
    expect(interpretResponse(true, 'Message not sent').outcome).toBe('failed')
    expect(interpretResponse(false, 'Bad gateway').outcome).toBe('failed')
  })
  it('does not guess: an unrecognised reply is "unconfirmed"', () => {
    expect(interpretResponse(true, '').outcome).toBe('unconfirmed')
    expect(interpretResponse(true, '{"foo":"bar"}').outcome).toBe('unconfirmed')
    expect(interpretResponse(true, 'OK 17').outcome).toBe('unconfirmed')
  })
})

describe('sending', () => {
  const reply = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch

  it('reports success and sends a GET to the send endpoint', async () => {
    let seen: URL | undefined
    let method: string | undefined
    const f = (async (u: URL, init: RequestInit) => { seen = u; method = init.method; return new Response('{"status":"success"}') }) as unknown as typeof fetch
    const out = await sendTemplate(cfg, { contact: '919876543210', template: 't', params: ['a'] }, f)
    expect(out.outcome).toBe('sent')
    expect(method).toBe('GET')
    expect(seen?.pathname).toBe('/api/sendtemplate.php')
  })
  it('never lets the key or license reach staff, even in an error', async () => {
    const boom = (async () => { throw new Error('connect failed https://x/?APIKey=SECRETKEY123&LicenseNumber=96594828442') }) as unknown as typeof fetch
    const out = await sendTemplate(cfg, { contact: '919876543210', template: 't', params: ['a'] }, boom)
    expect(out.outcome).toBe('failed')
    expect(out.detail).not.toContain('SECRETKEY123')
    expect(out.detail).not.toContain('96594828442')
    const echoed = await sendTemplate(cfg, { contact: '919876543210', template: 't', params: ['a'] }, reply('Invalid key SECRETKEY123'))
    expect(echoed.detail).not.toContain('SECRETKEY123')
  })
  it('gives up when the service does not answer', async () => {
    const hang = ((_u: URL, init: RequestInit) => new Promise((_res, rej) => { init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))) })) as unknown as typeof fetch
    const real = globalThis.setTimeout
    // shorten the 6 s wait for this test
    globalThis.setTimeout = ((fn: () => void) => real(fn, 5)) as typeof setTimeout
    try {
      const out = await sendTemplate(cfg, { contact: '919876543210', template: 't', params: ['a'] }, hang)
      expect(out).toMatchObject({ outcome: 'failed', detail: expect.stringContaining('did not answer') })
    } finally {
      globalThis.setTimeout = real
    }
  })
  it('checks the account through its own endpoint', async () => {
    let path = ''
    const f = (async (u: URL) => { path = u.pathname; return new Response('{"status":"success"}') }) as unknown as typeof fetch
    await checkAccount(cfg, f)
    expect(path).toBe('/api/accountvalidity.php')
  })
})
