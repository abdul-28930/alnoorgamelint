/**
 * Pure business rules, ported from the old Python backend (admin.py / bookings.py)
 * with known bugs fixed. All arithmetic is done in integer paise and rounded once.
 */
export const toPaise = (rupees: number) => Math.round(rupees * 100)
export const fromPaise = (paise: number) => paise / 100

export type DiscountType = 'NONE' | 'PERCENTAGE' | 'AMOUNT'
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING'

export interface PriceInput {
  hourlyRate: number
  durationHours: number
  userCount: number
  foodTotal?: number
  discountType?: DiscountType | string | null
  discountValue?: number | null
  /** Rupee amount already granted by a coupon at booking time. The old edit path silently dropped it. */
  couponDiscount?: number | null
}

export interface PriceBreakdown {
  originalAmount: number
  discountAmount: number
  totalAmount: number
}

/** original = rate x hours x users + food; total = max(0, original - discount). */
export function computePrice(i: PriceInput): PriceBreakdown {
  const original = Math.round(toPaise(i.hourlyRate) * i.durationHours * i.userCount) + toPaise(i.foodTotal ?? 0)
  const value = i.discountValue ?? 0
  let discount = 0
  if (i.discountType === 'PERCENTAGE') discount = Math.round((original * value) / 100)
  else if (i.discountType === 'AMOUNT') discount = Math.min(toPaise(value), original)
  discount = Math.max(0, discount)
  const coupon = Math.max(0, toPaise(i.couponDiscount ?? 0))
  return {
    originalAmount: fromPaise(original),
    discountAmount: fromPaise(discount),
    totalAmount: fromPaise(Math.max(0, original - discount - coupon)),
  }
}

/** Coupon discount on a base amount (percentage), rounded to paise. */
export function couponDiscount(baseAmount: number, percentage: number): number {
  return fromPaise(Math.round((toPaise(baseAmount) * percentage) / 100))
}

/** Advance is 30% of the total. */
export function advanceAmount(total: number): number {
  return fromPaise(Math.round(toPaise(total) * 0.3))
}

export function remainingAmount(total: number, amountPaid: number): number {
  return fromPaise(Math.max(0, toPaise(total) - toPaise(amountPaid)))
}

export function paymentStatus(total: number, amountPaid: number): PaymentStatus {
  if (remainingAmount(total, amountPaid) === 0) return 'PAID'
  return amountPaid > 0 ? 'PARTIAL' : 'PENDING'
}

export const FREE_CANCEL_WINDOW_SECONDS = 3600
export const CANCELLATION_FEE_RATE = 0.05

/** Full refund within 1 hour of creating the booking, otherwise a 5% fee. */
export function cancellationRefund(amountPaid: number, createdAt: Date, now: Date = new Date()) {
  const paid = toPaise(amountPaid)
  const elapsed = (now.getTime() - createdAt.getTime()) / 1000
  const fee = elapsed <= FREE_CANCEL_WINDOW_SECONDS ? 0 : Math.round(paid * CANCELLATION_FEE_RATE)
  return { refundAmount: fromPaise(paid - fee), cancellationFee: fromPaise(fee) }
}

export interface PrepaidBillingInput {
  elapsedSeconds: number
  cardRemainingMinutes: number
  hourlyRate: number
  userCount: number
}

export interface PrepaidBilling {
  minutesBilled: number
  minutesCovered: number
  overflowMinutes: number
  overflowHours: number
  overflowCharge: number
  cardRemainingAfter: number
}

/**
 * Timer stop against a prepaid card: whole minutes with a 1-minute minimum;
 * minutes beyond the card are charged per started hour at the hourly rate
 * (x users, which the old code ignored).
 */
export function prepaidBilling(i: PrepaidBillingInput): PrepaidBilling {
  const minutesBilled = Math.max(1, Math.floor(i.elapsedSeconds / 60))
  const minutesCovered = Math.min(minutesBilled, Math.max(0, i.cardRemainingMinutes))
  const overflowMinutes = minutesBilled - minutesCovered
  const overflowHours = Math.ceil(overflowMinutes / 60)
  return {
    minutesBilled,
    minutesCovered,
    overflowMinutes,
    overflowHours,
    overflowCharge: fromPaise(Math.round(toPaise(i.hourlyRate) * overflowHours * i.userCount)),
    cardRemainingAfter: Math.max(0, i.cardRemainingMinutes) - minutesCovered,
  }
}
