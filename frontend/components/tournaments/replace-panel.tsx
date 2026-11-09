'use client'

import { useState } from 'react'
import { MemberSearch, type Member } from '@/components/admin/member-search'
import type { Entrant } from '@/lib/tournaments'

/**
 * Replace a no-show: search the waitlist, or find a member who is not in the tournament yet. Whoever is chosen takes
 * exactly the no-show's place in the bracket; every other pairing stays.
 */
export function ReplaceNoShow({ out, waitlist, busy, onConfirm, onClose }: {
  out: Entrant
  /** who can come in: the waitlist (oldest first), then players who withdrew earlier */
  waitlist: Entrant[]
  busy: boolean
  onConfirm: (who: { entrantId?: string; userId?: string }, label: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [entrantId, setEntrantId] = useState<string | null>(null)
  const [member, setMember] = useState<Member | null>(null)

  const text = q.trim().toLowerCase()
  const digits = text.replace(/\D/g, '')
  const shown = waitlist
    .map((e, i) => ({ e, position: i + 1 }))
    .filter(({ e }) => !text || e.display_name.toLowerCase().includes(text) || (digits.length >= 3 && (e.phone ?? '').replace(/\D/g, '').includes(digits)) || (e.email ?? '').toLowerCase().includes(text))
  const chosen = entrantId ? waitlist.find((e) => e.id === entrantId) : null
  const label = chosen?.display_name ?? member?.full_name ?? member?.username ?? ''

  return (
    <div className="basis-full rounded border border-cyan-800 bg-gray-800 p-3 text-sm">
      <div className="mb-2 font-semibold">Replace <span className="text-red-300">{out.display_name}</span> with:</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-gray-300">From the waitlist or players who withdrew ({waitlist.length})</div>
          <input className="mb-2 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5" placeholder="Search by name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {shown.length === 0 && <p className="text-gray-400">Nobody matches. Use the member search on the right for anyone else.</p>}
            {shown.map(({ e, position }) => (
              <button key={e.id} type="button" onClick={() => { setEntrantId(e.id); setMember(null) }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left ${entrantId === e.id ? 'bg-cyan-700' : 'bg-gray-900 hover:bg-gray-700'}`}>
                <span className="truncate">{e.display_name}{e.phone ? <span className="text-gray-400"> · {e.phone}</span> : null}</span>
                <span className="shrink-0 text-xs text-gray-400">{e.status === 'withdrawn' ? 'withdrawn' : `#${position}`}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-gray-300">Or a member who is not entered yet</div>
          <MemberSearch value={member} onChange={(m) => { setMember(m); if (m) setEntrantId(null) }} />
          <p className="mt-2 text-xs text-gray-400">They are entered in the tournament and put straight into this place.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button disabled={busy || !label} className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => onConfirm(entrantId ? { entrantId } : { userId: member!.user_id }, label)}>
          {label ? `Put ${label} in the bracket` : 'Choose a player'}
        </button>
        <button className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
