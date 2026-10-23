'use client'

import { useState } from 'react'
import { apiFetch, apiError } from '@/lib/api'

/** "Send receipt on WhatsApp": goes to the number on file, or to one staff type here. */
export function SendReceiptModal({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const send = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await apiFetch(`/api/v1/admin/bookings/${bookingId}/receipt/whatsapp`, { method: 'POST', body: JSON.stringify(phone.trim() ? { phone: phone.trim() } : {}) })
      if (!res.ok) throw new Error(await apiError(res, 'Could not send the receipt'))
      const out = (await res.json()) as { status: string; sent_to: string; detail?: string }
      if (out.status === 'sent') setResult({ ok: true, text: `Receipt sent to ${out.sent_to}.` })
      else if (out.status === 'duplicate') setResult({ ok: false, text: out.detail ?? 'Already sent a moment ago.' })
      else if (out.status === 'unconfirmed') setResult({ ok: false, text: `The WhatsApp service gave an unclear answer, so we cannot be sure it was sent to ${out.sent_to}. Check Admin > WhatsApp before sending again.` })
      else setResult({ ok: false, text: `Not sent (${out.status}${out.detail ? `: ${out.detail}` : ''}).` })
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-cp-cyan/30 bg-cp-gray p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-xl font-bold text-cp-yellow">Send receipt on WhatsApp</h3>
        <p className="mb-4 text-sm text-gray-400">The receipt PDF goes to the customer's WhatsApp number on file. Type a number below to send it somewhere else, or if there is none on file.</p>
        <label className="block text-sm text-white">Mobile number (optional)
          <input className="mt-1 w-full rounded border border-cp-cyan/30 bg-cp-black/50 px-3 py-2 text-white" inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
        </label>
        {result && <p className={`mt-3 text-sm ${result.ok ? 'text-green-400' : 'text-red-400'}`}>{result.text}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-500" onClick={onClose}>{result?.ok ? 'Close' : 'Cancel'}</button>
          {!result?.ok && <button className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send receipt'}</button>}
        </div>
      </div>
    </div>
  )
}
