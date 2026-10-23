import 'server-only'
import { getEnv } from '../env'

/**
 * The only place that talks to Ten Digit (My Dreams Technology). Every call is a GET with the account key in the URL,
 * so nothing here may ever log or return a URL: errors are scrubbed of the key before they leave this file.
 */

export interface WhatsappConfig { licenseNumber: string; apiKey: string; baseUrl: string }

/** null when sending is switched off or the keys are missing */
export function getWhatsappConfig(): WhatsappConfig | null {
  const env = getEnv()
  if (env.WHATSAPP_ENABLED === 'false' || !env.WHATSAPP_LICENSE_NUMBER || !env.WHATSAPP_API_KEY) return null
  return { licenseNumber: env.WHATSAPP_LICENSE_NUMBER, apiKey: env.WHATSAPP_API_KEY, baseUrl: env.WHATSAPP_API_BASE.replace(/\/$/, '') }
}

/** For callers that only want to know whether it is worth preparing a message (never throws, e.g. when env is incomplete). */
export function isWhatsappConfigured(): boolean {
  try {
    return getWhatsappConfig() !== null
  } catch {
    return false
  }
}

/** "98765 43210", "+91 98765-43210", "09876543210" -> "919876543210". Anything else (landline, wrong length) -> null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits[1])) return `91${digits.slice(1)}`
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits[2])) return digits
  return null
}

/**
 * Template variables travel as one comma-separated value, and WhatsApp rejects empty values, line breaks and runs of
 * spaces, so every value is flattened to one tidy line first.
 */
export function cleanParam(value: unknown): string {
  const text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/,/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 200)
  return text || '-'
}

export interface TemplateSend {
  contact: string // 91XXXXXXXXXX
  template: string
  params: string[]
  /** recipient's name, if the account wants it */
  name?: string
  /** link that ends the "View tournament" button, e.g. the tournament id */
  urlParam?: string
  /** public https link to a PDF for a document header, and the name it should have */
  fileUrl?: string
  pdfName?: string
  /** public https link to an image/video header */
  headUrl?: string
}

export function buildSendUrl(cfg: WhatsappConfig, s: TemplateSend): URL {
  const url = new URL(`${cfg.baseUrl}/sendtemplate.php`)
  const q = url.searchParams
  q.set('LicenseNumber', cfg.licenseNumber)
  q.set('APIKey', cfg.apiKey)
  q.set('Contact', s.contact)
  q.set('Template', s.template)
  q.set('Param', s.params.map(cleanParam).join(','))
  if (s.name) q.set('Name', cleanParam(s.name))
  if (s.urlParam) q.set('URLParam', s.urlParam)
  if (s.fileUrl) q.set('Fileurl', s.fileUrl)
  if (s.pdfName) q.set('PDFName', s.pdfName)
  if (s.headUrl) q.set('HeadURL', s.headUrl)
  return url
}

export type Outcome = 'sent' | 'failed' | 'unconfirmed'
export interface SendResult { outcome: Outcome; detail: string }

const NEGATIVE = /(not sent|fail|error|invalid|not valid|expired|insufficient|balance|unauthori[sz]ed|denied|wrong|not found|blocked|not approved|not exist|missing|rejected)/i
const POSITIVE = /(success|submitted|queued|accepted|delivered|\bsent\b|message ?id|msg ?id|"id")/i

/**
 * We were not given a sample reply, so this reads whatever comes back defensively. A clear failure is a failure,
 * a clear success is a success, and anything it cannot tell is "unconfirmed": shown to staff and NOT retried,
 * because retrying a message that may have gone out would send it twice.
 */
export function interpretResponse(httpOk: boolean, body: string): SendResult {
  const detail = body.slice(0, 500)
  if (!httpOk) return { outcome: 'failed', detail: detail || 'The WhatsApp service returned an error' }
  try {
    const json: unknown = JSON.parse(body)
    if (json && typeof json === 'object') {
      const o = json as Record<string, unknown>
      const flag = o.success ?? o.Success
      if (flag === false || o.error === true) return { outcome: 'failed', detail }
      if (flag === true) return { outcome: 'sent', detail }
      const status = String(o.status ?? o.Status ?? o.result ?? o.Result ?? o.message ?? o.Message ?? '')
      if (NEGATIVE.test(status)) return { outcome: 'failed', detail }
      if (POSITIVE.test(status) || /^(ok|true|1)$/i.test(status)) return { outcome: 'sent', detail }
      return { outcome: 'unconfirmed', detail }
    }
  } catch {
    /* not JSON: judge the text */
  }
  if (NEGATIVE.test(body)) return { outcome: 'failed', detail }
  if (POSITIVE.test(body)) return { outcome: 'sent', detail }
  return { outcome: 'unconfirmed', detail }
}

const TIMEOUT_MS = 6000

function scrub(text: string, cfg: WhatsappConfig): string {
  return text.split(cfg.apiKey).join('***').split(cfg.licenseNumber).join('***')
}

async function get(cfg: WhatsappConfig, url: URL, fetchImpl: typeof fetch): Promise<SendResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { method: 'GET', cache: 'no-store', signal: controller.signal })
    const body = await res.text()
    const result = interpretResponse(res.ok, body)
    return { ...result, detail: scrub(result.detail, cfg) }
  } catch (e) {
    const timedOut = (e as Error)?.name === 'AbortError'
    return { outcome: 'failed', detail: timedOut ? 'The WhatsApp service did not answer in time' : scrub(`Could not reach the WhatsApp service: ${(e as Error)?.message ?? e}`, cfg) }
  } finally {
    clearTimeout(timer)
  }
}

export function sendTemplate(cfg: WhatsappConfig, send: TemplateSend, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  return get(cfg, buildSendUrl(cfg, send), fetchImpl)
}

/** "Check Account Validity": for the settings screen's status line */
export function checkAccount(cfg: WhatsappConfig, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const url = new URL(`${cfg.baseUrl}/accountvalidity.php`)
  url.searchParams.set('LicenseNumber', cfg.licenseNumber)
  url.searchParams.set('APIKey', cfg.apiKey)
  return get(cfg, url, fetchImpl)
}
