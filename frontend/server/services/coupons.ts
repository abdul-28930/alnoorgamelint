import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { AuthUser } from '../auth'
import { ApiError, badRequest, forbidden, notFound } from '../http'
import { getSupabase } from '../supabase'

export const couponCodeQuery = z.object({ coupon_code: z.string().trim().min(1).max(50) })
export const referralQuery = z.object({ referral_code: z.string().trim().min(1).max(50) })

/** Active, unused, unexpired and (if personal) owned by the caller. Exact-case match: generated codes are mixed case. */
export async function validateCoupon(user: AuthUser, code: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('coupons')
    .select('discount_percentage, created_for, expires_at')
    .eq('code', code)
    .eq('is_active', true)
    .is('used_by', null)
    .maybeSingle()
  if (error) throw new ApiError(500, 'Failed to validate coupon')
  if (!data || (data.expires_at && new Date(data.expires_at) <= new Date())) throw notFound('Invalid or expired coupon')
  if (data.created_for && data.created_for !== user.id) throw forbidden('This coupon is not for you')
  return { discount_percentage: data.discount_percentage, valid: true }
}

export async function listMyCoupons(userId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('coupons').select('*').eq('created_for', userId).order('created_at', { ascending: false })
  if (error) throw new ApiError(500, 'Failed to load coupons')
  return data ?? []
}

/** 30% off the first booking. New accounts already get one from a database trigger, so this is usually a no-op. */
export async function createFirstBookingCoupon(user: AuthUser, db: SupabaseClient = getSupabase()) {
  const [existing, bookings] = await Promise.all([
    db.from('coupons').select('id').eq('created_for', user.id).eq('type', 'FIRST_BOOKING').limit(1),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', user.id).neq('status', 'CANCELLED'),
  ])
  if (existing.error || bookings.error) throw new ApiError(500, 'Failed to create coupon')
  if (existing.data?.length) return { message: 'First booking coupon already exists' }
  if ((bookings.count ?? 0) > 0) throw badRequest('First booking coupon is only for new customers')

  const code = `FIRST${user.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
  const { error } = await db.from('coupons').insert({
    code,
    type: 'FIRST_BOOKING',
    discount_percentage: 30,
    created_for: user.id,
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  })
  if (error) throw new ApiError(500, 'Failed to create coupon')
  return { message: 'First booking coupon created', code }
}

/** One referral per account, new customers only. `referred_by` is claimed first so retries cannot mint extra coupons. */
export async function useReferral(user: AuthUser, referralCode: string, db: SupabaseClient = getSupabase()) {
  const { data: referrer } = await db.from('user_profiles').select('user_id').eq('referral_code', referralCode).maybeSingle()
  if (!referrer) throw notFound('Invalid referral code')
  if (referrer.user_id === user.id) throw badRequest('Cannot use your own referral code')

  const { count } = await db.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  if ((count ?? 0) > 0) throw badRequest('Referral codes are only for new users')

  const { data: claimed, error: claimError } = await db
    .from('user_profiles')
    .update({ referred_by: referrer.user_id })
    .eq('user_id', user.id)
    .is('referred_by', null)
    .select('user_id')
  if (claimError) throw new ApiError(500, 'Failed to apply referral')
  if (!claimed?.length) throw badRequest('You have already used a referral code')

  const { error } = await db.rpc('create_referral_coupons', { referrer_id: referrer.user_id, referee_id: user.id })
  if (error) {
    await db.from('user_profiles').update({ referred_by: null }).eq('user_id', user.id)
    throw new ApiError(500, 'Failed to apply referral')
  }
  return { message: 'Referral coupons created for both users' }
}
