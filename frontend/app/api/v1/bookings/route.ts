import { authenticate } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { createBooking, createBookingSchema, listUserBookings } from '@/server/services/bookings'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  const user = await authenticate(req)
  return listUserBookings(user.id)
})

export const POST = route(async (req) => {
  const user = await authenticate(req)
  return createBooking(user, await parseJson(req, createBookingSchema))
})
