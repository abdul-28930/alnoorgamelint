import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { AuthUser } from '../auth'
import { addDays, toIstString } from '../time'
import { ApiError, badRequest, notFound } from '../http'
import { getSupabase } from '../supabase'
import { availability, type GtaSettings } from '../gta/slots'
import { mapRpcError } from './bookings'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const fail = (msg: string, error: unknown) => {
  console.error(`${msg}:`, error)
  return new ApiError(500, msg)
}
const needSql = () => new ApiError(503, 'The GTA VI booking tables are missing. Run sql/setup/23_gta.sql in Supabase, then try again.')
const isMissing = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205' || /does not exist|could not find the (function|table)|schema cache/i.test(e.message ?? ''))

/** Short codes raised by the database functions, in words the staff and customers can act on. */
const GTA_ERRORS: Record<string, [number, string]> = {
  PACKAGE_NOT_FOUND: [404, 'That package is not available'],
  START_REQUIRED: [400, 'Choose a day and start time for this package'],
  PASS_NOT_ACTIVE: [400, 'This package is finished or cancelled'],
  BAD_DURATION: [400, 'Choose a whole number of hours (within the limit for one visit)'],
  OUTSIDE_HOURS: [400, 'That time is outside opening hours, or the visit would run past closing time'],
  BAD_SLOT: [400, 'Pick a start time from the list'],
  IN_PAST: [400, 'That time has already passed'],
  SLOT_TAKEN: [400, 'The GTA VI console is already booked at that time. Pick another slot'],
  VISIT_NOT_FOUND: [404, 'Visit not found'],
  NOT_STARTABLE: [400, 'This visit has already started or finished'],
  CONSOLE_BUSY: [400, 'Someone is playing right now. Stop their timer first'],
  NOT_RUNNING: [400, 'This visit is not running'],
  NOT_CANCELLABLE: [400, 'Only a visit that has not started can be cancelled'],
  PASS_NOT_FOUND: [404, 'Package purchase not found'],
  BAD_AMOUNT: [400, 'Enter a valid amount'],
}

function rpcFailure(error: { code?: string; message?: string }, fallback: string): ApiError {
  const left = /NOT_ENOUGH_TIME:(\d+)/.exec(error.message ?? '')
  if (left) {
    const m = Number(left[1])
    return badRequest(m > 0 ? `This package only has ${Math.floor(m / 60)} h ${m % 60} min left to book` : 'All of this package\'s time is already booked or used. Buy another package for more hours')
  }
  if (isMissing(error)) return needSql()
  return mapRpcError(error, fallback, GTA_ERRORS)
}

// ---- settings and packages ----------------------------------------------------------------------

export const DEFAULT_SETTINGS: GtaSettings = { open_time: '09:00', close_time: '23:30', slot_minutes: 60, block_max_hours: 5, max_visit_hours: 8 }

export async function getSettings(db: SupabaseClient = getSupabase()): Promise<GtaSettings> {
  const { data, error } = await db.from('gta_settings').select('open_time, close_time, slot_minutes, block_max_hours, max_visit_hours').eq('id', 1).maybeSingle()
  if (error) throw isMissing(error) ? needSql() : fail('Failed to load the GTA VI settings', error)
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as GtaSettings
}

export async function listPackages(db: SupabaseClient = getSupabase(), opts: { all?: boolean } = {}) {
  let q = db.from('gta_packages').select('*').order('players').order('sort_order')
  if (!opts.all) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw isMissing(error) ? needSql() : fail('Failed to load the GTA VI packages', error)
  return (data ?? []) as Row[]
}

/** What the customer page needs in one call. */
export async function catalog(db: SupabaseClient = getSupabase()) {
  const [settings, packages] = await Promise.all([getSettings(db), listPackages(db)])
  return { settings, packages }
}

export const packageSchema = z.object({
  players: z.union([z.literal(1), z.literal(2)]),
  name: z.string().trim().min(1).max(40),
  hours: z.number().int().min(1).max(200),
  price: z.number().finite().min(0).max(1_000_000),
  includes: z.string().trim().max(200).nullable().optional(),
  badge: z.string().trim().max(30).nullable().optional(),
  active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(1000).default(0),
})
export const packageUpdateSchema = packageSchema.partial()

export async function createPackage(input: z.infer<typeof packageSchema>, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('gta_packages').insert(input).select().single()
  if (error?.code === '23505') throw badRequest('A package with that name already exists for solo/duo')
  if (error) throw isMissing(error) ? needSql() : fail('Failed to create the package', error)
  return data
}

export async function updatePackage(id: string, input: z.infer<typeof packageUpdateSchema>, db: SupabaseClient = getSupabase()) {
  if (Object.keys(input).length === 0) throw badRequest('Nothing to update')
  const { data, error } = await db.from('gta_packages').update(input).eq('id', id).select().maybeSingle()
  if (error?.code === '23505') throw badRequest('A package with that name already exists for solo/duo')
  if (error) throw fail('Failed to update the package', error)
  if (!data) throw notFound('Package not found')
  return data
}

export async function deletePackage(id: string, db: SupabaseClient = getSupabase()) {
  const { error } = await db.from('gta_packages').delete().eq('id', id) // purchases keep their own copy of the name, price and hours
  if (error) throw fail('Failed to delete the package', error)
  return { message: 'Package deleted' }
}

export const settingsSchema = z
  .object({
    open_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00'),
    close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 23:30'),
    slot_minutes: z.number().int().min(15).max(240),
    block_max_hours: z.number().int().min(1).max(24),
    max_visit_hours: z.number().int().min(1).max(24),
  })
  .partial()
  .refine((v) => !v.open_time || !v.close_time || v.close_time > v.open_time, 'Closing time must be after opening time')

export async function updateSettings(input: z.infer<typeof settingsSchema>, db: SupabaseClient = getSupabase()) {
  if (Object.keys(input).length === 0) throw badRequest('Nothing to update')
  const { error } = await db.from('gta_settings').upsert({ id: 1, ...input })
  if (error) throw isMissing(error) ? needSql() : fail('Failed to save the settings', error)
  return getSettings(db)
}

// ---- availability --------------------------------------------------------------------------------

export const availabilityQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-25'),
  duration_minutes: z.coerce.number().int().min(15).max(1440).default(60),
})

export async function dayAvailability(q: z.infer<typeof availabilityQuery>, db: SupabaseClient = getSupabase(), now: Date = new Date()) {
  const settings = await getSettings(db)
  const { data, error } = await db
    .from('gta_visits')
    .select('start_at, end_at')
    .in('status', ['UPCOMING', 'ONGOING'])
    .gte('start_at', `${q.date} 00:00:00`)
    .lt('start_at', `${addDays(q.date, 1)} 00:00:00`)
  if (error) throw isMissing(error) ? needSql() : fail('Failed to load the day', error)
  return { date: q.date, duration_minutes: q.duration_minutes, settings, slots: availability(q.date, q.duration_minutes, settings, (data ?? []) as { start_at: string; end_at: string }[], toIstString(now)) }
}

// ---- customers ------------------------------------------------------------------------------------

const istTime = z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/, 'expected YYYY-MM-DD HH:MM')
const toIst = (s: string) => s.replace('T', ' ').padEnd(19, ':00').slice(0, 19)

export const buySchema = z.object({ package_id: z.guid('Choose a package'), start_at: istTime.optional() })
export const visitSchema = z.object({ start_at: istTime, duration_minutes: z.number().int().min(15).max(1440) })

export async function buyPackage(user: AuthUser, input: z.infer<typeof buySchema>, db: SupabaseClient = getSupabase(), now: Date = new Date()) {
  const { data, error } = await db.rpc('gta_buy', {
    p_user_id: user.id, p_guest_name: null, p_guest_phone: null, p_package_id: input.package_id,
    p_start_at: input.start_at ? toIst(input.start_at) : null, p_now_ist: toIstString(now), p_staff: false, p_created_by: user.id,
  })
  if (error || !data) throw rpcFailure(error ?? {}, 'Failed to book the package')
  return data
}

async function ownPass(db: SupabaseClient, user: AuthUser, passId: string) {
  const { data, error } = await db.from('gta_passes').select('id').eq('id', passId).eq('user_id', user.id).maybeSingle()
  if (error) throw isMissing(error) ? needSql() : fail('Failed to load the package', error)
  if (!data) throw notFound('Package not found')
}

export async function bookMyVisit(user: AuthUser, passId: string, input: z.infer<typeof visitSchema>, db: SupabaseClient = getSupabase(), now: Date = new Date()) {
  await ownPass(db, user, passId)
  const { data, error } = await db.rpc('gta_add_visit', { p_pass_id: passId, p_start_at: toIst(input.start_at), p_duration_minutes: input.duration_minutes, p_now_ist: toIstString(now), p_staff: false })
  if (error || !data) throw rpcFailure(error ?? {}, 'Failed to book the visit')
  return data
}

export async function cancelMyVisit(user: AuthUser, visitId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('gta_visit_cancel', { p_visit_id: visitId, p_user_id: user.id })
  if (error || !data) throw rpcFailure(error ?? {}, 'Failed to cancel the visit')
  return data
}

/** A pass with its visits and what is left: bought, played, still to book. */
function describePass(p: Row, visits: Row[]) {
  const mine = visits.filter((v) => v.pass_id === p.id).sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))
  const booked = mine.filter((v) => ['UPCOMING', 'ONGOING'].includes(v.status)).reduce((s, v) => s + Number(v.duration_minutes), 0)
  return {
    ...p,
    remaining_minutes: Number(p.total_minutes) - Number(p.used_minutes),
    unbooked_minutes: Math.max(0, Number(p.total_minutes) - Number(p.used_minutes) - booked),
    visits: mine,
  }
}

export async function myPasses(user: AuthUser, db: SupabaseClient = getSupabase()) {
  const { data: passes, error } = await db.from('gta_passes').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) throw isMissing(error) ? needSql() : fail('Failed to load your packages', error)
  const ids = (passes ?? []).map((p) => p.id as string)
  const { data: visits } = ids.length ? await db.from('gta_visits').select('*').in('pass_id', ids) : { data: [] as Row[] }
  return (passes ?? []).map((p) => describePass(p, (visits ?? []) as Row[]))
}

// ---- staff -----------------------------------------------------------------------------------------

async function customerNames(db: SupabaseClient, passes: Row[]): Promise<Map<string, { name: string; phone: string | null }>> {
  const ids = Array.from(new Set(passes.map((p) => p.user_id).filter(Boolean))) as string[]
  const { data } = ids.length ? await db.from('user_profiles').select('user_id, username, full_name, phone').in('user_id', ids) : { data: [] as Row[] }
  return new Map(((data ?? []) as Row[]).map((p) => [p.user_id as string, { name: (p.full_name || p.username) as string, phone: (p.phone ?? null) as string | null }]))
}

const customerOf = (p: Row, names: Map<string, { name: string; phone: string | null }>) => {
  const m = p.user_id ? names.get(p.user_id) : undefined
  return { customer: m?.name ?? p.guest_name ?? 'Guest', customer_phone: m?.phone ?? p.guest_phone ?? null }
}

/** One day on the single console: every visit with who and what package, in time order. */
export async function adminSchedule(date: string, db: SupabaseClient = getSupabase()) {
  const [settings, { data: visits, error }] = await Promise.all([
    getSettings(db),
    db.from('gta_visits').select('*').neq('status', 'CANCELLED').gte('start_at', `${date} 00:00:00`).lt('start_at', `${addDays(date, 1)} 00:00:00`).order('start_at'),
  ])
  if (error) throw isMissing(error) ? needSql() : fail('Failed to load the schedule', error)
  const passIds = Array.from(new Set((visits ?? []).map((v) => v.pass_id as string)))
  const { data: passes } = passIds.length ? await db.from('gta_passes').select('*').in('id', passIds) : { data: [] as Row[] }
  const names = await customerNames(db, (passes ?? []) as Row[])
  const passById = new Map(((passes ?? []) as Row[]).map((p) => [p.id as string, p]))
  return {
    date,
    settings,
    visits: (visits ?? []).map((v) => {
      const p = passById.get(v.pass_id as string)
      return { ...v, pass: p ? { ...p, remaining_minutes: Number(p.total_minutes) - Number(p.used_minutes), ...customerOf(p, names) } : null }
    }),
  }
}

export async function adminPasses(db: SupabaseClient = getSupabase(), opts: { limit?: number } = {}) {
  const { data: passes, error } = await db.from('gta_passes').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 200)
  if (error) throw isMissing(error) ? needSql() : fail('Failed to load the packages', error)
  const ids = (passes ?? []).map((p) => p.id as string)
  const [{ data: visits }, names] = await Promise.all([
    ids.length ? db.from('gta_visits').select('*').in('pass_id', ids) : Promise.resolve({ data: [] as Row[] }),
    customerNames(db, (passes ?? []) as Row[]),
  ])
  return (passes ?? []).map((p) => ({ ...describePass(p, (visits ?? []) as Row[]), ...customerOf(p, names) }))
}

export const walkinSchema = z
  .object({
    package_id: z.guid('Choose a package'),
    username: z.string().trim().min(1).max(30).optional(),
    guest_name: z.string().trim().min(1).max(60).optional(),
    guest_phone: z.string().trim().max(20).optional(),
    /** a short package starts now when true (the default); otherwise give start_at */
    start_at: istTime.optional(),
  })
  .refine((v) => v.username || v.guest_name, "Enter the player's name, or a member's username")

/** Staff sell a package to someone at the counter. A short package is booked from now (or a given time) and its timer started. */
export async function adminWalkin(input: z.infer<typeof walkinSchema>, staff: AuthUser, db: SupabaseClient = getSupabase(), now: Date = new Date()) {
  let userId: string | null = null
  if (input.username) {
    const { data: profile } = await db.from('user_profiles').select('user_id').ilike('username', input.username.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle()
    if (!profile) throw notFound('No member has that username')
    userId = profile.user_id as string
  }
  const settings = await getSettings(db)
  const pkg = (await listPackages(db, { all: true })).find((p) => p.id === input.package_id)
  if (!pkg) throw notFound('That package is not available')
  const startNow = input.start_at ? toIst(input.start_at) : toIstString(now)
  const isBlock = Number(pkg.hours) <= settings.block_max_hours

  const { data, error } = await db.rpc('gta_buy', {
    p_user_id: userId, p_guest_name: userId ? null : input.guest_name ?? null, p_guest_phone: input.guest_phone ?? null, p_package_id: input.package_id,
    p_start_at: isBlock ? startNow : null, p_now_ist: toIstString(now), p_staff: true, p_created_by: staff.id,
  })
  if (error || !data) throw rpcFailure(error ?? {}, 'Failed to sell the package')
  const out = data as { pass_id: string; visit: { visit_id: string } | null }
  // arriving now: start the clock straight away (the console must be free, otherwise the visit stays booked and staff start it later)
  if (isBlock && out.visit && !input.start_at) {
    const started = await db.rpc('gta_visit_start', { p_visit_id: out.visit.visit_id })
    if (started.error) console.error('Walk-in booked but the timer did not start:', started.error.message)
  }
  return out
}

export const staffVisitSchema = z.object({ start_at: istTime, duration_minutes: z.number().int().min(15).max(1440) })

export async function adminBookVisit(passId: string, input: z.infer<typeof staffVisitSchema>, db: SupabaseClient = getSupabase(), now: Date = new Date()) {
  const { data, error } = await db.rpc('gta_add_visit', { p_pass_id: passId, p_start_at: toIst(input.start_at), p_duration_minutes: input.duration_minutes, p_now_ist: toIstString(now), p_staff: true })
  if (error || !data) throw rpcFailure(error ?? {}, 'Failed to book the visit')
  return data
}

export const visitActionSchema = z.enum(['start', 'stop', 'cancel'])

export async function visitAction(visitId: string, action: z.infer<typeof visitActionSchema>, db: SupabaseClient = getSupabase()) {
  const fn = { start: 'gta_visit_start', stop: 'gta_visit_stop', cancel: 'gta_visit_cancel' }[action]
  const { data, error } = await db.rpc(fn, { p_visit_id: visitId })
  if (error || !data) throw rpcFailure(error ?? {}, `Failed to ${action} the visit`)
  return data
}

export const paymentSchema = z.object({ amount_paid: z.number().finite().min(0).max(1_000_000), payment_method: z.string().trim().max(30).optional() })

export async function payPass(passId: string, input: z.infer<typeof paymentSchema>, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('gta_pass_pay', { p_pass_id: passId, p_amount: input.amount_paid, p_method: input.payment_method ?? null })
  if (error || !data) throw rpcFailure(error ?? {}, 'Failed to record the payment')
  return data
}

export const addonSchema = z.object({ package_id: z.guid('Choose a package'), start_at: istTime.optional() })

/** Extra hours are bought as another package for the same customer; a short one needs its start time. */
export async function addOnPackage(passId: string, input: z.infer<typeof addonSchema>, staff: AuthUser, db: SupabaseClient = getSupabase(), now: Date = new Date()) {
  const { data: pass, error } = await db.from('gta_passes').select('user_id, guest_name, guest_phone').eq('id', passId).maybeSingle()
  if (error) throw fail('Failed to load the package', error)
  if (!pass) throw notFound('Package purchase not found')
  const { data, error: rpcError } = await db.rpc('gta_buy', {
    p_user_id: pass.user_id, p_guest_name: pass.guest_name, p_guest_phone: pass.guest_phone, p_package_id: input.package_id,
    p_start_at: input.start_at ? toIst(input.start_at) : null, p_now_ist: toIstString(now), p_staff: true, p_created_by: staff.id,
  })
  if (rpcError || !data) throw rpcFailure(rpcError ?? {}, 'Failed to add the package')
  return data
}

export const passFoodSchema = z.object({ food_served: z.boolean() })

export async function setFoodServed(passId: string, served: boolean, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('gta_passes').update({ food_served: served }).eq('id', passId).select('id, food_served').maybeSingle()
  if (error) throw fail('Failed to update the food status', error)
  if (!data) throw notFound('Package purchase not found')
  return data
}
