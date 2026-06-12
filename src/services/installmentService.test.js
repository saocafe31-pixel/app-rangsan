import { describe, expect, it, vi } from 'vitest'

vi.mock('../utils/supabase', () => ({
  supabase: {}
}))

import {
  calculateInstallmentAmounts,
  normalizeInstallmentPlan,
  roundMoney
} from './installmentService'

describe('installmentService helpers', () => {
  it('calculates deposit, paid amount, and remaining balance from percent', () => {
    expect(calculateInstallmentAmounts(1250, 40, 500)).toEqual({
      totalAmount: 1250,
      depositPercent: 40,
      depositAmount: 500,
      paidAmount: 500,
      remainingAmount: 750,
      paymentStatus: 'partial'
    })
  })

  it('caps paid amount at order total and marks paid', () => {
    expect(calculateInstallmentAmounts(1000, 30, 1500)).toMatchObject({
      paidAmount: 1000,
      remainingAmount: 0,
      paymentStatus: 'paid'
    })
  })

  it('marks unpaid past due plans as overdue', () => {
    expect(calculateInstallmentAmounts(1000, 50, 0, '2000-01-01')).toMatchObject({
      remainingAmount: 1000,
      paymentStatus: 'overdue'
    })
  })

  it('normalizes stored plan rows for order screens', () => {
    expect(
      normalizeInstallmentPlan({
        id: 3,
        orderid: 'ORD1',
        useremail: 'buyer@example.com',
        total_amount: '999.99',
        deposit_percent: '25',
        deposit_amount: '250',
        paid_amount: '300',
        payment_status: 'partial',
        due_date: '2026-06-30'
      })
    ).toMatchObject({
      id: 3,
      orderId: 'ORD1',
      userEmail: 'buyer@example.com',
      totalAmount: 999.99,
      depositPercent: 25,
      depositAmount: 250,
      paidAmount: 300,
      remainingAmount: 699.99,
      paymentStatus: 'partial',
      dueDate: '2026-06-30'
    })
  })

  it('rounds money to two decimals', () => {
    expect(roundMoney(10.005)).toBe(10.01)
  })
})
