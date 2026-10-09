import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError } from '../http'
import { getSupabase } from '../supabase'

export const availabilityQuery = z.object({
  type: z.enum(['PC', 'PS5']),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'invalid date'),
})

function unwrap<T>(res: { data: T | null; error: unknown }, what: string): T {
  if (res.error) {
    console.error(`Failed to load ${what}:`, res.error)
    throw new ApiError(500, `Failed to load ${what}`)
  }
  return res.data ?? ([] as unknown as T)
}

export async function listStations(db: SupabaseClient = getSupabase()) {
  return unwrap(await db.from('stations').select('*').eq('active', true).order('name'), 'stations')
}

export async function listPrepaidPlans(db: SupabaseClient = getSupabase()) {
  return unwrap(await db.from('prepaid_plans').select('*').eq('active', true).order('price'), 'prepaid plans')
}

export async function listRewards(db: SupabaseClient = getSupabase()) {
  return unwrap(await db.from('points_rewards').select('*').eq('active', true).order('points_cost'), 'rewards')
}

/** One database call instead of ~24 x stations queries. */
export async function availabilityByType(type: string, date: string, db: SupabaseClient = getSupabase()) {
  return unwrap(await db.rpc('get_availability_by_type', { p_type: type, p_date: date }), 'availability')
}
