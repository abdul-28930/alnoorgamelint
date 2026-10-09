import { authenticate } from '@/server/auth'
import { rateLimit } from '@/server/rateLimit'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { redeemReward } from '@/server/services/points'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { rewardId: string } }) => {
  rateLimit(req, 'redeem', 20)
  const user = await authenticate(req)
  return redeemReward(user.id, uuidParam.parse(ctx.params.rewardId))
})
