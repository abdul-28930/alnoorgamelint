import 'server-only'
import { z } from 'zod'

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Only needed for projects that still sign JWTs with the legacy HS256 secret.
  SUPABASE_JWT_SECRET: z.string().optional(),
  SMTP_SERVER: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  CRON_SECRET: z.string().optional(),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

/** Parsed lazily so `next build` does not need server secrets. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse({
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    })
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
      throw new Error(`Invalid server environment: ${fields}`)
    }
    cached = parsed.data
  }
  return cached
}
