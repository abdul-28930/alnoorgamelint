import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, notFound } from '../http'
import { getSupabase } from '../supabase'

export const purchaseQuery = z.object({ plan_id: z.guid('Invalid plan id') })

/** Only staff-confirmed (ACTIVE) cards count towards the usable balance. */
export async function getBalance(userId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('user_prepaid_cards').select('remaining_minutes').eq('user_id', userId).eq('status', 'ACTIVE')
  if (error) throw new ApiError(500, 'Failed to load balance')
  return { remaining_minutes: (data ?? []).reduce((sum, r) => sum + (r.remaining_minutes ?? 0), 0) }
}

/**
 * Creates a PENDING card. There is no payment gateway: staff takes the money at the counter and
 * confirms the card in the admin panel, which makes the minutes usable.
 */
export async function purchasePlan(userId: string, planId: string, db: SupabaseClient = getSupabase()) {
  const { data: plan, error } = await db.from('prepaid_plans').select('id, minutes').eq('id', planId).eq('active', true).maybeSingle()
  if (error) throw new ApiError(500, 'Failed to purchase plan')
  if (!plan) throw notFound('Plan not found')

  const { data, error: insertError } = await db
    .from('user_prepaid_cards')
    .insert({ user_id: userId, plan_id: plan.id, total_minutes: plan.minutes, remaining_minutes: plan.minutes, status: 'PENDING' })
    .select()
    .single()
  if (insertError) throw new ApiError(500, 'Failed to purchase plan')
  return data
}

export async function listMyCards(userId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('user_prepaid_cards')
    .select('id, total_minutes, remaining_minutes, status, created_at, prepaid_plans(name, price, minutes)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new ApiError(500, 'Failed to load cards')
  return data ?? []
}
