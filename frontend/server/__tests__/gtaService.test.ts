import { describe, expect, it } from 'vitest'
import { fakeDb } from './fakeDb'
import { bookMyVisit, buyPackage, payPass } from '../services/gta'

const user = { id: 'u1', email: 'a@b.c', role: 'user' } as never
const pkgId = '11111111-1111-4111-8111-111111111111'

describe('gta service', () => {
  it('turns a taken slot into a clear 400 with a plain message', async () => {
    const { db } = fakeDb({ rpcs: { gta_buy: { error: { message: 'SLOT_TAKEN' } } } })
    await expect(buyPackage({ package_id: pkgId, start_at: '2030-01-01 10:00:00' } as never, user, db)).rejects.toMatchObject({ status: 400 })
  })

  it('reports a missing SQL file as 503', async () => {
    const { db } = fakeDb({ rpcs: { gta_buy: { error: { message: 'Could not find the function public.gta_buy in the schema cache' } } } })
    await expect(buyPackage({ package_id: pkgId } as never, user, db)).rejects.toMatchObject({ status: 503 })
  })

  it('refuses booking on a pass that belongs to someone else', async () => {
    const { db } = fakeDb({ tables: { gta_passes: { data: null } } })
    await expect(bookMyVisit(user, '22222222-2222-4222-8222-222222222222', { start_at: '2030-01-01 10:00:00', duration_minutes: 60 } as never, db)).rejects.toMatchObject({ status: 404 })
  })

  it('records a payment through the rpc', async () => {
    const { db } = fakeDb({ rpcs: { gta_pass_pay: { data: { id: 'p', payment_status: 'PAID' } } } })
    await expect(payPass('p', { amount_paid: 500 }, db)).resolves.toMatchObject({ payment_status: 'PAID' })
  })
})
