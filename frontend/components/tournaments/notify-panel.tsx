'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, type Match, type NotifyPreview, type NotifyProgress } from '@/lib/tournaments'

const AUDIENCES: { value: string; label: string }[] = [
  { value: 'registered', label: 'Everyone registered' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'no_show', label: 'No-shows' },
  { value: 'round', label: 'Players still to play in a round' },
]
const input = 'w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white'

/** "Send notification": a WhatsApp message to a group of players, sent in small batches with live progress. */
export function NotifyPanel({ id, tournamentName, matches }: { id: string; tournamentName: string; matches: Match[] }) {
  const [audience, setAudience] = useState('registered')
  const rounds = useMemo(() => {
    const seen = new Map<number, string>()
    matches.filter((m) => m.bracket !== 'third').forEach((m) => seen.set(m.round, m.round_name))
    return Array.from(seen.entries()).sort((a, b) => a[0] - b[0])
  }, [matches])
  const [round, setRound] = useState<number | undefined>(undefined)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<NotifyPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<NotifyProgress | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const effectiveRound = audience === 'round' ? round ?? rounds[0]?.[0] : undefined

  useEffect(() => {
    if (audience === 'round' && effectiveRound === undefined) { setPreview(null); return }
    let alive = true
    setPreview(null)
    api.notifyPreview(id, audience, effectiveRound).then((p) => alive && setPreview(p)).catch(() => alive && setPreview(null))
    return () => { alive = false }
  }, [id, audience, effectiveRound])

  const send = async () => {
    if (!preview || !message.trim()) return
    if (!confirm(`Send this WhatsApp message to ${preview.with_number} ${preview.with_number === 1 ? 'person' : 'people'}?\n\n"${message.trim()}"`)) return
    setBusy(true); setError(null); setDone(null); setProgress(null)
    const batch_id = crypto.randomUUID()
    try {
      let p = await api.notifyStart(id, { audience, round: effectiveRound, message: message.trim(), batch_id })
      setProgress(p)
      for (let i = 0; p.remaining > 0 && i < 100; i++) {
        p = await api.notifyContinue(id, batch_id)
        setProgress(p)
      }
      setDone(`Done: ${p.totals.sent} sent${p.totals.failed ? `, ${p.totals.failed} failed` : ''}${p.totals.unconfirmed ? `, ${p.totals.unconfirmed} unconfirmed` : ''}${p.totals.skipped ? `, ${p.totals.skipped} skipped` : ''}. Details are in Admin > WhatsApp.`)
      setMessage('')
    } catch (e) {
      setError(`${(e as Error).message}. Anything not sent yet stays queued and the system finishes it within a few minutes.`)
    } finally {
      setBusy(false)
    }
  }

  const sentSoFar = progress ? progress.totals.sent + progress.totals.failed + progress.totals.unconfirmed : 0
  const total = progress ? sentSoFar + progress.totals.pending : 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Sends the approved "tournament update" WhatsApp template with a link to this tournament. Players without a number are skipped.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Send to
          <select className={`${input} mt-1`} value={audience} onChange={(e) => setAudience(e.target.value)} disabled={busy}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        {audience === 'round' && (
          <label className="text-sm">Round
            <select className={`${input} mt-1`} value={effectiveRound ?? ''} onChange={(e) => setRound(Number(e.target.value))} disabled={busy || rounds.length === 0}>
              {rounds.length === 0 && <option value="">Generate the bracket first</option>}
              {rounds.map(([r, name]) => <option key={r} value={r}>{name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="text-sm text-gray-300">
        {preview ? (
          preview.people === 0
            ? 'Nobody in this group has an account to message.'
            : <>Will reach <b className="text-white">{preview.with_number}</b> {preview.with_number === 1 ? 'person' : 'people'}{preview.without_number > 0 && <span className="text-yellow-300"> ({preview.without_number} without a valid number will be skipped)</span>}{preview.sample.length > 0 && <span className="text-gray-500">: {preview.sample.join(', ')}{preview.people > preview.sample.length ? '…' : ''}</span>}</>
        ) : 'Counting…'}
      </div>
      <label className="block text-sm">Message
        <textarea className={`${input} mt-1`} rows={3} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value.replace(/[\r\n]+/g, ' '))} placeholder="Round of 64 starts at 11:00 AM. Please arrive by 10:30 AM." disabled={busy} />
        <span className="text-xs text-gray-500">{message.length}/200 · one line, no line breaks</span>
      </label>
      <div className="rounded bg-black/40 p-3 text-sm text-gray-300">
        <div className="mb-1 text-xs uppercase text-gray-500">What they will see</div>
        Hi Rahul, an update for {tournamentName}: {message.trim() || '…'} Reply here if you have any questions.
      </div>
      <button className="rounded bg-green-600 px-4 py-2 font-semibold disabled:opacity-50" disabled={busy || !preview || preview.with_number === 0 || !message.trim()} onClick={send}>
        {busy ? 'Sending…' : 'Send WhatsApp message'}
      </button>
      {progress && busy && (
        <div>
          <div className="h-2 overflow-hidden rounded bg-gray-700"><div className="h-full bg-green-500 transition-all" style={{ width: `${total ? Math.round((sentSoFar / total) * 100) : 0}%` }} /></div>
          <div className="mt-1 text-xs text-gray-400">{sentSoFar} of {total} done. Keep this page open.</div>
        </div>
      )}
      {done && <div className="rounded border border-green-600 bg-green-900/30 p-3 text-sm text-green-300">{done}</div>}
      {error && <div className="rounded border border-red-600 bg-red-900/40 p-3 text-sm text-red-300">{error}</div>}
    </div>
  )
}
