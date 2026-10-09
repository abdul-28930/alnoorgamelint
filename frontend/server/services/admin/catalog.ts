import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { clearRoleCache } from '../../auth'
import { ApiError, badRequest, notFound } from '../../http'
import { getSupabase } from '../../supabase'
import { mapRpcError } from '../bookings'

const fail = (msg: string, error: unknown) => {
  console.error(`${msg}:`, error)
  return new ApiError(500, msg)
}

// ---- prepaid plans -----------------------------------------------------------------------------
export const planSchema = z.object({
  id: z.guid().optional(),
  name: z.string().trim().min(1).max(100),
  price: z.number().finite().min(0),
  minutes: z.number().int().min(1).max(100_000),
  active: z.boolean().default(true),
})

export async function listPlans(db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('prepaid_plans').select('*').order('created_at')
  if (error) throw fail('Failed to load plans', error)
  return data ?? []
}

export async function savePlan(input: z.infer<typeof planSchema>, db: SupabaseClient = getSupabase()) {
  const { id, ...fields } = input
  const q = id ? db.from('prepaid_plans').update(fields).eq('id', id) : db.from('prepaid_plans').insert(fields)
  const { data, error } = await q.select().maybeSingle()
  if (error) throw fail('Failed to save plan', error)
  if (!data) throw notFound('Plan not found')
  return data
}

export async function deletePlan(id: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('prepaid_plans').delete().eq('id', id).select('id')
  if (error?.code === '23503') throw badRequest('Plan has been purchased; deactivate it instead of deleting')
  if (error) throw fail('Failed to delete plan', error)
  if (!data?.length) throw notFound('Plan not found')
  return { message: 'Deleted' }
}

// ---- prepaid cards (staff confirms payment) ----------------------------------------------------
export const cardsQuery = z.object({ status: z.enum(['PENDING', 'ACTIVE']).default('PENDING') })

export async function listCards(status: 'PENDING' | 'ACTIVE', db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('user_prepaid_cards')
    .select('id, user_id, status, total_minutes, remaining_minutes, created_at, prepaid_plans(name, price, minutes)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw fail('Failed to load cards', error)
  const rows = data ?? []
  const ids = Array.from(new Set(rows.map((r) => r.user_id as string)))
  const { data: profiles } = ids.length ? await db.from('user_profiles').select('user_id, username, full_name, phone').in('user_id', ids) : { data: [] }
  const byId = new Map((profiles ?? []).map((p) => [p.user_id as string, p]))
  return rows.map((r) => ({ ...r, user_profiles: byId.get(r.user_id as string) ?? null }))
}

export async function confirmCard(id: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('confirm_prepaid_card', { p_card_id: id })
  if (error || !data) throw mapRpcError(error, 'Failed to confirm card')
  return data
}

// ---- users & points ----------------------------------------------------------------------------
export const usersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
})

export async function listUsers({ page, limit }: z.infer<typeof usersQuery>, db: SupabaseClient = getSupabase()) {
  const from = (page - 1) * limit
  const { data, error } = await db.from('user_profiles').select('*').order('created_at', { ascending: false }).range(from, from + limit - 1)
  if (error) throw fail('Failed to load users', error)
  return data ?? []
}

export const userIdsSchema = z.array(z.guid()).max(500)

export async function profilesByIds(ids: string[], db: SupabaseClient = getSupabase()) {
  if (ids.length === 0) return []
  const { data, error } = await db.from('user_profiles').select('*').in('user_id', ids)
  if (error) throw fail('Failed to load profiles', error)
  return data ?? []
}

export const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(1000).default(200) })

export async function pointsTransactions(limit: number, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('points_transactions')
    .select('*, user_profiles(username)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw fail('Failed to load transactions', error)
  return data ?? []
}

// ---- admin emails ------------------------------------------------------------------------------
export const adminEmailsSchema = z.array(z.string().trim().toLowerCase().email()).max(50)

export async function getAdminEmails(db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('admin_settings').select('admin_emails').eq('id', 1).maybeSingle()
  if (error) throw fail('Failed to load admin emails', error)
  try {
    const list: unknown = JSON.parse(data?.admin_emails ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export async function setAdminEmails(emails: string[], db: SupabaseClient = getSupabase()) {
  const unique = Array.from(new Set(emails))
  const { error } = await db.from('admin_settings').upsert({ id: 1, admin_emails: JSON.stringify(unique) })
  if (error) throw fail('Failed to update admin emails', error)
  clearRoleCache()
  return { message: 'Admin emails updated successfully' }
}

// ---- food items --------------------------------------------------------------------------------
export const foodItemsSchema = z
  .array(z.object({ name: z.string().trim().min(1).max(100), price: z.number().finite().min(0) }))
  .max(500)
  .refine((items) => new Set(items.map((i) => i.name)).size === items.length, 'Duplicate item names')

export async function listFoodItems(db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('charges_items').select('name, price').eq('active', true).order('name')
  if (error) throw fail('Failed to load food items', error)
  return (data ?? []).map((r) => ({ name: r.name, price: Number(r.price) }))
}

/** Upserts the list and switches off items that were removed (history keeps their names), instead of delete-all. */
export async function replaceFoodItems(items: z.infer<typeof foodItemsSchema>, db: SupabaseClient = getSupabase()) {
  if (items.length) {
    const { error } = await db.from('charges_items').upsert(items.map((i) => ({ ...i, active: true })), { onConflict: 'name' })
    if (error) throw fail('Failed to update food items', error)
  }
  const keep = new Set(items.map((i) => i.name))
  const { data: active } = await db.from('charges_items').select('name').eq('active', true)
  const remove = (active ?? []).map((r) => r.name as string).filter((n) => !keep.has(n))
  if (remove.length) {
    const { error } = await db.from('charges_items').update({ active: false }).in('name', remove)
    if (error) throw fail('Failed to update food items', error)
  }
  return { message: 'Food items updated successfully' }
}

// ---- coupons -----------------------------------------------------------------------------------
export const createCouponQuery = z.object({
  code: z.string().trim().min(3).max(50).transform((s) => s.toUpperCase()),
  discount_percentage: z.coerce.number().gt(0).max(100),
  coupon_type: z.string().trim().min(1).max(30).default('PROMO'),
  expires_days: z.coerce.number().int().min(1).max(3650).default(30),
})

export async function listAllCoupons(db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('coupons').select('*').order('created_at', { ascending: false }).limit(1000)
  if (error) throw fail('Failed to load coupons', error)
  return data ?? []
}

export async function createCoupon(adminId: string, q: z.infer<typeof createCouponQuery>, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('coupons')
    .insert({
      code: q.code,
      type: q.coupon_type,
      discount_percentage: q.discount_percentage,
      created_by: adminId,
      created_for: null,
      is_active: true,
      expires_at: new Date(Date.now() + q.expires_days * 86_400_000).toISOString(),
    })
    .select()
    .single()
  if (error?.code === '23505') throw badRequest('Coupon code already exists')
  if (error) throw fail('Failed to create coupon', error)
  return data
}
