import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest, notFound } from '../../http'
import { getSupabase } from '../../supabase'
import { fromIstString, toIstString } from '../../time'
import { planSchedule, type ScheduleSettings } from '../../tournaments/schedule'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 11:00')
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-14')

export const scheduleSettingsSchema = z
  .object({
    consoles: z.number().int().min(1, 'At least 1 console').max(20),
    match_minutes: z.number().int().min(1, 'A match is at least 1 minute').max(120),
    buffer_minutes: z.number().int().min(0).max(60),
    days: z.array(z.object({ date, start: hhmm, end: hhmm })).min(1, 'Add at least one day').max(7),
    breaks: z.array(z.object({ date: date.optional(), start: hhmm, end: hhmm, label: z.string().trim().max(40).optional() })).max(20),
  })
  .superRefine((v, ctx) => {
    v.days.forEach((d, i) => { if (d.end <= d.start) ctx.addIssue({ code: 'custom', path: ['days', i, 'end'], message: 'Closing time must be after the start time' }) })
    v.breaks.forEach((b, i) => { if (b.end <= b.start) ctx.addIssue({ code: 'custom', path: ['breaks', i, 'end'], message: 'A break must end after it starts' }) })
  })

export const generateScheduleSchema = z.object({ settings: scheduleSettingsSchema, replan_from_now: z.boolean().default(false) })

const missingSql = () => new ApiError(503, 'The database is missing the match schedule columns. Run sql/setup/20_match_schedule.sql in Supabase, then try again.')

export async function getScheduleSettings(tournamentId: string, db: SupabaseClient = getSupabase()): Promise<{ settings: ScheduleSettings | null }> {
  const { data, error } = await db.from('tournaments').select('schedule_settings').eq('id', tournamentId).maybeSingle()
  if (error) throw /column|schema cache/i.test(error.message ?? '') ? missingSql() : new ApiError(500, 'Failed to load the schedule settings')
  if (!data) throw notFound('Tournament not found')
  return { settings: (data.schedule_settings as ScheduleSettings | null) ?? null }
}

/**
 * Saves the settings and gives every match still to be played a kick-off time and a console. With replan_from_now only the
 * time from now on is used (for when the day runs late). Matches already live, finished or byes keep what they have.
 */
export async function generateSchedule(tournamentId: string, input: z.infer<typeof generateScheduleSchema>, db: SupabaseClient = getSupabase(), now: Date = new Date()) {
  const settings = input.settings as ScheduleSettings
  const { data: matches, error } = await db.from('tournament_matches').select('id, round, position, bracket, status').eq('tournament_id', tournamentId)
  if (error) throw new ApiError(500, 'Failed to load the matches')
  if (!matches?.length) throw badRequest('Generate the bracket first, then plan the schedule')

  const saved = await db.from('tournaments').update({ schedule_settings: settings }).eq('id', tournamentId).select('id').maybeSingle()
  if (saved.error) throw /column|schema cache/i.test(saved.error.message ?? '') ? missingSql() : new ApiError(500, 'Failed to save the schedule settings')
  if (!saved.data) throw notFound('Tournament not found')

  const todo = matches.filter((m) => !['bye', 'completed', 'live'].includes(m.status as string))
  const from = input.replan_from_now ? toIstString(now).slice(0, 16) : undefined
  const plan = planSchedule(todo as never[], settings, from)

  if (plan.items.length) {
    const { error: saveError } = await db.rpc('save_match_schedule', {
      p_tournament_id: tournamentId,
      p_items: plan.items.map((i) => ({ id: i.id, at: fromIstString(`${i.at}:00`).toISOString(), console: i.console })),
    })
    if (saveError) {
      const missing = saveError.code === 'PGRST202' || /could not find the function|column|schema cache/i.test(saveError.message ?? '')
      throw missing ? missingSql() : new ApiError(500, 'Failed to save the schedule')
    }
  }
  const times = plan.items.map((i) => i.at).sort()
  return { scheduled: plan.items.length, unscheduled: plan.unscheduled.length, first: times[0] ?? null, last: times[times.length - 1] ?? null }
}
