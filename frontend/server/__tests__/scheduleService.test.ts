import { describe, expect, it } from 'vitest'
import { fakeDb, rpcArgs, type Call } from './fakeDb'
import { generateSchedule, generateScheduleSchema, scheduleSettingsSchema } from '../services/admin/schedule'

const settings = { consoles: 4, match_minutes: 3, buffer_minutes: 1, days: [{ date: '2026-11-14', start: '11:00', end: '18:00' }], breaks: [{ start: '13:30', end: '14:30', label: 'Lunch' }] }
const T = 't1'
const m = (id: string, round: number, position: number, status = 'ready', bracket = 'main') => ({ id, round, position, bracket, status })
const has = (c: Call[], x: string) => c.some((y) => y.method === x)

const world = (matches: object[]) =>
  fakeDb({ tables: { tournament_matches: { data: matches }, tournaments: (c: Call[]) => (has(c, 'update') ? { data: { id: T } } : { data: { schedule_settings: null } }) }, rpcs: { save_match_schedule: { data: 5 } } })

describe('scheduleSettingsSchema', () => {
  it('accepts sensible settings', () => expect(scheduleSettingsSchema.parse(settings).consoles).toBe(4))
  it('refuses a day that ends before it starts, a bad time and zero consoles', () => {
    expect(() => scheduleSettingsSchema.parse({ ...settings, days: [{ date: '2026-11-14', start: '18:00', end: '11:00' }] })).toThrow(/after/)
    expect(() => scheduleSettingsSchema.parse({ ...settings, days: [{ date: '2026-11-14', start: '9am', end: '11:00' }] })).toThrow()
    expect(() => scheduleSettingsSchema.parse({ ...settings, consoles: 0 })).toThrow()
    expect(() => scheduleSettingsSchema.parse({ ...settings, breaks: [{ start: '14:00', end: '13:00' }] })).toThrow(/break/i)
  })
})

describe('generateSchedule', () => {
  it('times only the matches still to be played, as IST instants, 4 at a time', async () => {
    const w = world([m('a', 1, 1), m('b', 1, 2), m('c', 1, 3), m('d', 1, 4), m('e', 1, 5), m('x', 1, 6, 'bye'), m('y', 1, 7, 'completed'), m('z', 1, 8, 'live')])
    const out = await generateSchedule(T, generateScheduleSchema.parse({ settings }), w.db, new Date('2026-11-10T00:00:00Z'))
    const items = (rpcArgs(w.log, 'save_match_schedule')!.p_items as { id: string; at: string; console: number }[])
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(items[0]).toEqual({ id: 'a', at: '2026-11-14T05:30:00.000Z', console: 1 }) // 11:00 IST
    expect(items[4]).toEqual({ id: 'e', at: '2026-11-14T05:34:00.000Z', console: 1 }) // the next slot, 4 minutes later
    expect(out).toMatchObject({ scheduled: 5, unscheduled: 0, first: '2026-11-14 11:00', last: '2026-11-14 11:04' })
  })
  it('saves the settings it used', async () => {
    const w = world([m('a', 1, 1)])
    await generateSchedule(T, generateScheduleSchema.parse({ settings }), w.db)
    const upd = w.log.find((e) => e.table === 'tournaments' && has(e.calls, 'update'))!
    expect(upd.calls.find((c) => c.method === 'update')!.args[0]).toEqual({ schedule_settings: settings })
  })
  it('re-plans from now: nothing is placed before the current time', async () => {
    const w = world([m('a', 1, 1)])
    await generateSchedule(T, generateScheduleSchema.parse({ settings, replan_from_now: true }), w.db, new Date('2026-11-14T07:00:00Z')) // 12:30 IST
    expect((rpcArgs(w.log, 'save_match_schedule')!.p_items as { at: string }[])[0].at).toBe('2026-11-14T07:00:00.000Z')
  })
  it('says when the matches do not fit, and needs a bracket first', async () => {
    const many = Array.from({ length: 300 }, (_, i) => m(`m${i}`, 1, i + 1))
    expect(await generateSchedule(T, generateScheduleSchema.parse({ settings }), world(many).db)).toMatchObject({ unscheduled: expect.any(Number) })
    await expect(generateSchedule(T, generateScheduleSchema.parse({ settings }), world([]).db)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('bracket') })
  })
  it('explains a missing SQL file', async () => {
    const w = fakeDb({ tables: { tournament_matches: { data: [m('a', 1, 1)] }, tournaments: { data: { id: T } } }, rpcs: { save_match_schedule: { error: { code: 'PGRST202', message: 'could not find the function' } } } })
    await expect(generateSchedule(T, generateScheduleSchema.parse({ settings }), w.db)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('20_match_schedule.sql') })
  })
})
