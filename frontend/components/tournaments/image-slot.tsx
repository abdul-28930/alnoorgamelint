'use client'

import { useRef, useState } from 'react'
import { api, MAX_SIDE, shrinkImage, type ImageKind } from '@/lib/tournaments'

/** Admin control for one picture (banner or poster) of an existing tournament. */
export function ImageSlot({ id, kind, url, onChange }: { id: string; kind: ImageKind; url?: string | null; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wide = kind === 'banner'

  const pick = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await api.uploadImage(id, kind, await shrinkImage(file, MAX_SIDE[kind]))
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.removeImage(id, kind)
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <div className="mb-1 text-sm font-semibold capitalize text-gray-300">{kind} <span className="font-normal text-gray-500">{wide ? '(wide, about 3:1)' : '(portrait, about 2:3)'}</span></div>
      <div className={`flex items-center justify-center overflow-hidden rounded border border-dashed border-gray-600 bg-gray-800 ${wide ? 'h-32' : 'h-56 w-40'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={`${kind} preview`} className="h-full w-full object-cover" /> : <span className="text-sm text-gray-500">No {kind}</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <button disabled={busy} onClick={() => input.current?.click()} className="rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium disabled:opacity-50">{busy ? 'Working…' : url ? 'Replace' : 'Upload'}</button>
        {url && <button disabled={busy} onClick={remove} className="rounded bg-red-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50">Remove</button>}
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  )
}
