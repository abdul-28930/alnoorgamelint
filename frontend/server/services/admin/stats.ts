import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError } from '../../http'
import { getSupabase } from '../../supabase'
import { istDate } from '../../time'

export const statsQuery = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Aggregated in SQL (the old code downloaded every booking and summed in Python). "Today" is IST. */
export async function summary(q: z.infer<typeof statsQuery>, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('admin_stats_summary', {
    p_start: q.start_date ?? null,
    p_end: q.end_date ?? null,
    p_today: istDate(),
  })
  if (error) throw new ApiError(500, 'Failed to load stats')
  return data
}

export async function payments(db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('admin_stats_payments')
  if (error) throw new ApiError(500, 'Failed to load payment stats')
  return data
}
