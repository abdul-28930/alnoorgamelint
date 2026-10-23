'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminGuard } from '@/components/ui/admin-guard'
import { call } from '@/lib/tournaments'

interface Template {
  event: string; label: string; description: string; vars: string[]; sample: Record<string, string>
  url_button: boolean; document: boolean; default_template: string; template_name: string; enabled: boolean
}
interface Status {
  configured: boolean; setup_complete: boolean; setup_hint: string | null
  account: { outcome: string; detail: string } | null; templates: Template[]
}
interface LogRow {
  id: string; event: string; recipient_phone: string | null; recipient_name: string | null; template_name: string | null
  status: 'pending' | 'sent' | 'failed' | 'unconfirmed' | 'skipped'; attempts: number; last_error: string | null
  provider_response: string | null; created_at: string; sent_at: string | null
}

const base = '/api/v1/admin/whatsapp'
const STATUS_STYLE: Record<string, string> = {
  sent: 'bg-green-900/60 text-green-300', failed: 'bg-red-900/60 text-red-300', unconfirmed: 'bg-yellow-900/60 text-yellow-300',
  skipped: 'bg-gray-700 text-gray-300', pending: 'bg-cyan-900/60 text-cyan-300',
}
const input = 'rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white'
const btn = 'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50'

export default function AdminWhatsappPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [log, setLog] = useState<{ data: LogRow[]; total: number; page: number; limit: number } | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [phone, setPhone] = useState('')
  const [filter, setFilter] = useState<{ status: string; event: string }>({ status: '', event: '' })
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [events, setEvents] = useState<string[]>([])

  const loadStatus = useCallback(async (check = false) => {
    try {
      const s = await call<Status>(`${base}?check=${check ? 1 : 0}`)
      setStatus(s)
      setEvents(s.templates.map((t) => t.event))
      setNames(Object.fromEntries(s.templates.map((t) => [t.event, t.template_name])))
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    }
  }, [])

  const loadLog = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page) })
    if (filter.status) q.set('status', filter.status)
    if (filter.event) q.set('event', filter.event)
    try {
      setLog(await call(`${base}/log?${q}`))
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    }
  }, [page, filter])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => { loadLog() }, [loadLog])

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMsg(null)
    try {
      const text = await fn()
      if (text) setMsg({ kind: 'ok', text })
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const test = (event: string) => run(async () => {
    const r = await call<{ status: string; detail?: string }>(`${base}/test`, { json: { event, phone } })
    await loadLog()
    return r.status === 'sent' ? 'Test message sent. Check the phone.' : `Test result: ${r.status}${r.detail ? ` (${r.detail})` : ''}`
  })

  return (
    <AdminGuard>
      <div className="min-h-screen bg-black p-6 text-white">
        <div className="mx-auto max-w-6xl space-y-8">
          <div>
            <h1 className="text-3xl font-bold">WhatsApp</h1>
            <p className="text-gray-400">Messages go out through your My Dreams Technology account using approved templates.</p>
          </div>

          {msg && <div className={`rounded-lg border p-3 ${msg.kind === 'ok' ? 'border-green-600 bg-green-900/30 text-green-300' : 'border-red-600 bg-red-900/40 text-red-300'}`}>{msg.text}</div>}

          {status && (
            <section className="rounded-lg bg-gray-900 p-5">
              <h2 className="mb-3 text-xl font-bold">Connection</h2>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded px-2 py-1 text-sm ${status.configured ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'}`}>
                  {status.configured ? 'Keys set on the server' : 'Not configured'}
                </span>
                {status.configured && <button className={`${btn} bg-cyan-600`} disabled={busy} onClick={() => run(async () => { await loadStatus(true) })}>Check account</button>}
              </div>
              {!status.configured && <p className="mt-3 text-sm text-gray-400">Set <code>WHATSAPP_LICENSE_NUMBER</code> and <code>WHATSAPP_API_KEY</code> in the Vercel environment variables, then redeploy. Nothing is sent until then.</p>}
              {status.setup_hint && <p className="mt-3 text-sm text-yellow-300">Database not ready: {status.setup_hint}.</p>}
              {status.account && (
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-3 text-xs text-gray-300">
                  {status.account.outcome}: {status.account.detail}
                </pre>
              )}
            </section>
          )}

          {status && (
            <section className="rounded-lg bg-gray-900 p-5">
              <h2 className="mb-1 text-xl font-bold">Messages and templates</h2>
              <p className="mb-4 text-sm text-gray-400">The template name must match an <b>approved</b> template exactly. Variables are filled in this order.</p>
              <label className="mb-4 block text-sm">Send a test to this mobile number
                <input className={`${input} mt-1 block w-60`} inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <div className="space-y-4">
                {status.templates.map((t) => (
                  <div key={t.event} className="rounded border border-gray-800 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-[12rem] flex-1">
                        <div className="font-semibold">{t.label}</div>
                        <div className="text-xs text-gray-400">{t.description}</div>
                      </div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.enabled} disabled={busy} onChange={(e) => run(async () => { await call(`${base}/templates/${t.event}`, { method: 'PUT', json: { enabled: e.target.checked } }); await loadStatus() })} />On</label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input className={`${input} w-72`} value={names[t.event] ?? ''} onChange={(e) => setNames((n) => ({ ...n, [t.event]: e.target.value }))} aria-label={`${t.label} template name`} />
                      <button className={`${btn} bg-gray-700`} disabled={busy || names[t.event] === t.template_name} onClick={() => run(async () => { await call(`${base}/templates/${t.event}`, { method: 'PUT', json: { template_name: names[t.event] } }); await loadStatus(); return 'Saved' })}>Save name</button>
                      {!t.document && <button className={`${btn} bg-green-700`} disabled={busy || !status.configured || phone.replace(/\D/g, '').length < 10} onClick={() => test(t.event)}>Send test</button>}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Variables: {t.vars.map((v, i) => `{{${i + 1}}} ${v}`).join(' · ')}
                      {t.url_button && ' · button link ends with the tournament id'}
                      {t.document && ' · receipt PDF attached'}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg bg-gray-900 p-5">
            <h2 className="mb-3 text-xl font-bold">Message log</h2>
            <div className="mb-4 flex flex-wrap gap-2">
              <select className={input} value={filter.status} onChange={(e) => { setPage(1); setFilter((f) => ({ ...f, status: e.target.value })) }}>
                <option value="">All results</option>
                {['sent', 'failed', 'unconfirmed', 'skipped', 'pending'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className={input} value={filter.event} onChange={(e) => { setPage(1); setFilter((f) => ({ ...f, event: e.target.value })) }}>
                <option value="">All messages</option>
                {events.map((e) => <option key={e} value={e}>{status?.templates.find((t) => t.event === e)?.label ?? e}</option>)}
              </select>
              <button className={`${btn} bg-gray-700`} onClick={loadLog}>Refresh</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-gray-400"><tr>{['When', 'Message', 'To', 'Result', ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                <tbody>
                  {log?.data.map((r) => (
                    <tr key={r.id} className="border-t border-gray-800 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-400">{new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="px-3 py-2">{status?.templates.find((t) => t.event === r.event)?.label ?? r.event}<div className="text-xs text-gray-500">{r.template_name}</div></td>
                      <td className="px-3 py-2">{r.recipient_name ?? '-'}<div className="text-xs text-gray-500">{r.recipient_phone ?? 'no number'}</div></td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                        {r.attempts > 1 && <span className="ml-1 text-xs text-gray-500">{r.attempts} tries</span>}
                        {r.last_error && <div className="mt-1 max-w-sm break-words text-xs text-gray-400">{r.last_error}</div>}
                      </td>
                      <td className="px-3 py-2">
                        {['failed', 'unconfirmed'].includes(r.status) && (
                          <button className={`${btn} bg-cyan-700`} disabled={busy} onClick={() => run(async () => { const o = await call<{ status: string }>(`${base}/log/${r.id}/resend`, { method: 'POST' }); await loadLog(); return `Send again: ${o.status}` })}>Send again</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {log && log.data.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No messages yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {log && log.total > log.limit && (
              <div className="mt-4 flex items-center gap-3 text-sm">
                <button className={`${btn} bg-gray-700`} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span>Page {page} of {Math.ceil(log.total / log.limit)}</span>
                <button className={`${btn} bg-gray-700`} disabled={page * log.limit >= log.total} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminGuard>
  )
}
