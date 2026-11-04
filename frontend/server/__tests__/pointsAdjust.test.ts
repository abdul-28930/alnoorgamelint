import { describe, expect, it } from 'vitest'
import { fakeDb, rpcArgs } from './fakeDb'
import { adjustPoints, pointsAdjustSchema } from '../services/admin/catalog'

const U = '00000000-0000-4000-8000-000000000001'
const parse = (o: object) => pointsAdjustSchema.parse({ user_id: U, reason: 'Won a contest', ...o })

describe('pointsAdjustSchema', () => {
  it('accepts adding and removing whole points with a reason', () => {
    expect(parse({ points: 50 }).points).toBe(50)
    expect(parse({ points: -20 }).points).toBe(-20)
  })
  it('refuses zero, fractions, huge numbers, a missing reason and a bad id', () => {
    expect(() => parse({ points: 0 })).toThrow()
    expect(() => parse({ points: 1.5 })).toThrow()
    expect(() => parse({ points: 100001 })).toThrow()
    expect(() => parse({ points: 5, reason: ' ' })).toThrow()
    expect(() => pointsAdjustSchema.parse({ user_id: 'x', points: 5, reason: 'abc' })).toThrow()
  })
})

describe('adjustPoints', () => {
  const world = (rpc: object) => fakeDb({ rpcs: { adjust_user_points: rpc } })
  it('sends the change with the staff member who made it', async () => {
    const w = world({ data: { balance: 70, previous: 20, change: 50 } })
    await expect(adjustPoints(parse({ points: 50 }), 'staff@x.com', w.db)).resolves.toMatchObject({ balance: 70 })
    expect(rpcArgs(w.log, 'adjust_user_points')).toEqual({ p_user_id: U, p_delta: 50, p_reason: 'Won a contest', p_staff: 'staff@x.com' })
  })
  it('says how many points the member has when too many are removed', async () => {
    await expect(adjustPoints(parse({ points: -40 }), 's', world({ error: { message: 'INSUFFICIENT_POINTS:30' } }).db))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('only has 30 points') })
  })
  it('explains the other refusals, and a missing SQL file', async () => {
    const run = (m: string, code?: string) => adjustPoints(parse({ points: 5 }), 's', world({ error: { message: m, code } }).db)
    await expect(run('USER_NOT_FOUND')).rejects.toMatchObject({ status: 404 })
    await expect(run('REASON_REQUIRED')).rejects.toMatchObject({ status: 400 })
    await expect(run('could not find the function', 'PGRST202')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('19_points_adjust.sql') })
  })
})
