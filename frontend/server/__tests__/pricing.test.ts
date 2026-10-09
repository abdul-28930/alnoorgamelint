import { describe, expect, it } from 'vitest'
import {
  advanceAmount, cancellationRefund, computePrice, couponDiscount, paymentStatus, prepaidBilling, remainingAmount,
} from '../pricing'

describe('computePrice', () => {
  it('multiplies rate x hours x users and adds food', () => {
    expect(computePrice({ hourlyRate: 150, durationHours: 2, userCount: 2, foodTotal: 100 })).toEqual({
      originalAmount: 700, discountAmount: 0, totalAmount: 700,
    })
  })
  it('applies percentage discounts to the whole original (incl. food)', () => {
    const r = computePrice({ hourlyRate: 100, durationHours: 1, userCount: 1, foodTotal: 100, discountType: 'PERCENTAGE', discountValue: 10 })
    expect(r).toEqual({ originalAmount: 200, discountAmount: 20, totalAmount: 180 })
  })
  it('caps flat discounts at the original and never goes negative', () => {
    const r = computePrice({ hourlyRate: 100, durationHours: 1, userCount: 1, discountType: 'AMOUNT', discountValue: 500 })
    expect(r.totalAmount).toBe(0)
    expect(r.discountAmount).toBe(100)
  })
  it('ignores unknown discount types', () => {
    expect(computePrice({ hourlyRate: 100, durationHours: 1, userCount: 1, discountType: 'BOGUS', discountValue: 50 }).totalAmount).toBe(100)
  })
  it('has no float drift', () => {
    expect(computePrice({ hourlyRate: 33.33, durationHours: 3, userCount: 1 }).totalAmount).toBe(99.99)
  })
})

describe('coupons, advance, payment', () => {
  it('rounds coupon discounts to paise', () => {
    expect(couponDiscount(333, 7)).toBe(23.31)
  })
  it('advance is 30%', () => {
    expect(advanceAmount(250)).toBe(75)
  })
  it('derives remaining and status', () => {
    expect(remainingAmount(100, 30)).toBe(70)
    expect(remainingAmount(100, 150)).toBe(0)
    expect(paymentStatus(100, 0)).toBe('PENDING')
    expect(paymentStatus(100, 30)).toBe('PARTIAL')
    expect(paymentStatus(100, 100)).toBe('PAID')
  })
})

describe('cancellationRefund', () => {
  const created = new Date('2026-01-01T10:00:00Z')
  it('refunds in full inside the 1 hour window', () => {
    expect(cancellationRefund(200, created, new Date('2026-01-01T11:00:00Z'))).toEqual({ refundAmount: 200, cancellationFee: 0 })
  })
  it('charges 5% afterwards', () => {
    expect(cancellationRefund(200, created, new Date('2026-01-01T11:00:01Z'))).toEqual({ refundAmount: 190, cancellationFee: 10 })
  })
})

describe('prepaidBilling', () => {
  it('bills at least one minute and covers it from the card', () => {
    const r = prepaidBilling({ elapsedSeconds: 10, cardRemainingMinutes: 60, hourlyRate: 120, userCount: 1 })
    expect(r).toMatchObject({ minutesBilled: 1, minutesCovered: 1, overflowCharge: 0, cardRemainingAfter: 59 })
  })
  it('charges overflow per started hour, per user', () => {
    const r = prepaidBilling({ elapsedSeconds: 100 * 60, cardRemainingMinutes: 30, hourlyRate: 120, userCount: 2 })
    expect(r).toMatchObject({ minutesCovered: 30, overflowMinutes: 70, overflowHours: 2, overflowCharge: 480, cardRemainingAfter: 0 })
  })
})
