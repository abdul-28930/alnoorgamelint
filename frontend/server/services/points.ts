import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, badRequest } from '../http'
import { getSupabase } from '../supabase'

export async function getPoints(userId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('user_profiles').select('points_balance').eq('user_id', userId).maybeSingle()
  if (error) throw new ApiError(500, 'Failed to load points')
  return { points_balance: data?.points_balance ?? 0 }
}

export async function pointsHistory(userId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('points_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new ApiError(500, 'Failed to load points history')
  return data ?? []
}

/** The real reason ("Insufficient points", "Reward not found") reaches the user as a 400. */
export async function redeemReward(userId: string, rewardId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('redeem_points_for_reward', { user_id_param: userId, reward_id_param: rewardId })
  if (error) throw new ApiError(500, 'Failed to redeem reward')
  const r = data as { success?: boolean; error?: string; coupon_code?: string; points_deducted?: number } | null
  if (!r?.success) throw badRequest(r?.error ?? 'Redemption failed')
  return { message: 'Reward redeemed successfully!', coupon_code: r.coupon_code, points_deducted: r.points_deducted }
}
