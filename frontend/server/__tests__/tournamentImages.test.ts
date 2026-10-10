import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fakeDb } from './fakeDb'
import { MAX_IMAGE_BYTES, removeTournamentImage, setTournamentImage, sniffImage } from '../services/admin/tournaments'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const T = { id: 't1', status: 'open', banner_image: 'https://x.supabase.co/storage/v1/object/public/tournament-images/t1/banner-1.jpg' }

function world(uploadError: unknown = null) {
  const base = fakeDb({ tables: { tournament_overview: { data: T }, tournaments: {} } })
  const uploads: { path: string; type?: string }[] = []
  const removed: string[][] = []
  const storage = {
    from: () => ({
      upload: (path: string, _b: unknown, opts: { contentType: string }) => { uploads.push({ path, type: opts.contentType }); return Promise.resolve({ error: uploadError }) },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/tournament-images/${path}` } }),
      remove: (paths: string[]) => { removed.push(paths); return Promise.resolve({ error: null }) },
    }),
  }
  return { db: { ...(base.db as object), from: (base.db as any).from.bind(base.db), storage } as unknown as SupabaseClient, log: base.log, uploads, removed } // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('tournament images', () => {
  it('recognises images by content, not by name', () => {
    expect(sniffImage(JPEG)).toEqual({ type: 'image/jpeg', ext: 'jpg' })
    expect(sniffImage(PNG)?.ext).toBe('png')
    expect(sniffImage(WEBP)?.ext).toBe('webp')
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
    expect(sniffImage(new Uint8Array([]))).toBeNull()
  })
  it('uploads, saves the public url, and deletes the previous file', async () => {
    const w = world()
    const { url } = await setTournamentImage('t1', 'banner', JPEG, w.db)
    expect(w.uploads).toHaveLength(1)
    expect(w.uploads[0].path).toMatch(/^t1\/banner-\d+\.jpg$/)
    expect(w.uploads[0].type).toBe('image/jpeg')
    expect(url).toContain(w.uploads[0].path)
    const update = w.log.find((e) => e.table === 'tournaments')!.calls.find((c) => c.method === 'update')!.args[0]
    expect(update).toEqual({ banner_image: url })
    expect(w.removed).toEqual([['t1/banner-1.jpg']])
  })
  it('refuses empty, oversized and non-image files before touching storage', async () => {
    const w = world()
    await expect(setTournamentImage('t1', 'poster', new Uint8Array(), w.db)).rejects.toMatchObject({ status: 400 })
    await expect(setTournamentImage('t1', 'poster', new Uint8Array(MAX_IMAGE_BYTES + 1), w.db)).rejects.toMatchObject({ message: expect.stringContaining('too large') })
    await expect(setTournamentImage('t1', 'poster', new TextEncoder().encode('GIF89a not allowed'), w.db)).rejects.toMatchObject({ message: expect.stringContaining('JPEG') })
    expect(w.uploads).toHaveLength(0)
  })
  it('reports a failed upload and leaves the old picture alone', async () => {
    const w = world({ message: 'boom' })
    await expect(setTournamentImage('t1', 'banner', JPEG, w.db)).rejects.toMatchObject({ status: 500 })
    expect(w.removed).toHaveLength(0)
  })
  it('removes a picture and its file', async () => {
    const w = world()
    await expect(removeTournamentImage('t1', 'banner', w.db)).resolves.toEqual({ message: 'Image removed' })
    expect(w.removed).toEqual([['t1/banner-1.jpg']])
    const update = w.log.find((e) => e.table === 'tournaments')!.calls.find((c) => c.method === 'update')!.args[0]
    expect(update).toEqual({ banner_image: null })
  })
})
