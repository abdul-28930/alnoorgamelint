import { route } from '@/server/http'
import { catalog } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

// The GTA VI price list and opening hours (public).
export const GET = route(async () => catalog())
