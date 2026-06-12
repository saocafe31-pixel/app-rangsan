import { describe, it, expect } from 'vitest'
import {
  computePromotionMoneyDiscount,
  computeSecondItemPromotionDiscount,
  isFreeShippingPromotionEligible,
  getPromotionAppliedProductQty,
  getPromotionEligiblePaidQty,
  getPromotionProductRemainingQty,
  getPromotionPaidQty,
  getSecondItemDiscountUnits,
  isPromotionVisibleToCustomer,
  isPromotionWithinProductQuota,
  isPromotionWithinUsageLimits,
  isPromotionWithinValidDates,
  parsePromotionIdsFromDiscountInfo,
  promotionDateInputToIsoRange
} from './promotionUtils'
import {
  eligibleSubtotalForSupplierScope,
  supplierKeysForSupplierScope
} from './couponSupplierSplitUtils'

describe('promotionUtils', () => {
  it('counts paid qty excluding free from same promo', () => {
    const item = { qty: 5, isFree: true, freeQty: 2, promotionId: 'p1' }
    expect(getPromotionPaidQty(item, 'p1')).toBe(3)
  })

  it('fixed discount applies per unit', () => {
    const promo = { id: 'p1', Type: 'discount_fixed', DiscountAmount: 10 }
    const item = { id: 'A1', price: 300, qty: 2 }
    expect(computePromotionMoneyDiscount(promo, item)).toBe(20)
  })

  it('target unit price discount from list price', () => {
    const promo = { id: 'p1', Type: 'target_unit_price', DiscountAmount: 290 }
    const item = { id: 'A1', price: 310, qty: 1 }
    expect(computePromotionMoneyDiscount(promo, item)).toBe(20)
  })

  it('valid until end of calendar day', () => {
    const untilIso = promotionDateInputToIsoRange('2026-04-30', 'until')
    const promo = { ValidUntil: untilIso }
    const noon = new Date(2026, 3, 30, 12, 0, 0)
    expect(isPromotionWithinValidDates(promo, noon)).toBe(true)
  })

  it('second item discount units', () => {
    expect(getSecondItemDiscountUnits(1)).toBe(0)
    expect(getSecondItemDiscountUnits(2)).toBe(1)
    expect(getSecondItemDiscountUnits(4)).toBe(2)
  })

  it('second item percent discount on 2nd and 4th units', () => {
    const promo = { id: 'p2', Type: 'second_item_discount', DiscountPercentage: 50 }
    const item = { id: 'A1', price: 100, qty: 4 }
    expect(computeSecondItemPromotionDiscount(promo, item)).toBe(100)
  })

  it('second item fixed baht per discounted unit', () => {
    const promo = { id: 'p2', Type: 'second_item_discount', DiscountAmount: 30 }
    const item = { id: 'A1', price: 100, qty: 3 }
    expect(computeSecondItemPromotionDiscount(promo, item)).toBe(30)
  })

  it('parses PromoIds from discount info', () => {
    expect(parsePromotionIdsFromDiscountInfo('Code: X | PromoIds: 3, 7')).toEqual([3, 7])
  })

  it('usage limits block when total cap reached', () => {
    const promo = { id: 1, TotalUsageLimit: 10, UsageCount: 10, UsageLimit: 0 }
    expect(isPromotionWithinUsageLimits(promo)).toBe(false)
  })

  it('per-user usage limit from order DiscountInfo', () => {
    const promo = { id: 3, UsageLimit: 1, TotalUsageLimit: 0, UsageCount: 0 }
    const rows = [
      { OrderID: 'O1', DiscountInfo: 'Promotion: -10B | PromoIds: 3' },
      { OrderID: 'O2', DiscountInfo: 'Code: X | PromoIds: 3, 7' }
    ]
    expect(isPromotionWithinUsageLimits(promo, { userOrderRows: rows })).toBe(false)
  })

  it('matches promotion target customer type', () => {
    expect(isPromotionVisibleToCustomer({ TargetCustomerType: 'all' }, { userType: 'regular' })).toBe(true)
    expect(isPromotionVisibleToCustomer({ TargetCustomerType: 'regular' }, { userType: 'regular' })).toBe(true)
    expect(isPromotionVisibleToCustomer({ TargetCustomerType: 'regular' }, { userType: 'franchise' })).toBe(false)
    expect(isPromotionVisibleToCustomer({ TargetCustomerType: 'franchise' }, { customerType: 'franchise' })).toBe(true)
  })

  it('uses product quota limit before stock fallback', () => {
    const promo = { PromotionProductLimit: 10, PromotionProductUsed: 4 }
    expect(getPromotionProductRemainingQty(promo, { stockQty: 99 })).toBe(6)
    expect(isPromotionWithinProductQuota(promo, { stockQty: 99 })).toBe(true)
  })

  it('uses real stock when product quota limit is zero', () => {
    expect(getPromotionProductRemainingQty({ PromotionProductLimit: 0 }, { stockQty: 7 })).toBe(7)
    expect(isPromotionWithinProductQuota({ PromotionProductLimit: 0 }, { stockQty: 0 })).toBe(false)
  })

  it('partially applies fixed discount to remaining promo product quantity', () => {
    const promo = { id: 'p1', Type: 'discount_fixed', DiscountAmount: 10, PromotionProductLimit: 3, PromotionProductUsed: 1 }
    const item = { id: 'A1', price: 100, qty: 5 }
    const eligiblePaidQty = getPromotionEligiblePaidQty(promo, item, { stockQty: 100 })
    expect(eligiblePaidQty).toBe(2)
    expect(computePromotionMoneyDiscount(promo, item, { eligiblePaidQty })).toBe(20)
    expect(getPromotionAppliedProductQty(promo, item, { eligiblePaidQty })).toBe(2)
  })

  it('counts only complete buy-x promo sets as applied product quantity', () => {
    const promo = { id: 'p1', Type: 'buy_x_get_y', BuyQuantity: 5, PromotionProductLimit: 7, PromotionProductUsed: 0 }
    const item = { id: 'A1', price: 100, qty: 7 }
    const eligiblePaidQty = getPromotionEligiblePaidQty(promo, item, { stockQty: 100 })
    expect(eligiblePaidQty).toBe(7)
    expect(getPromotionAppliedProductQty(promo, item, { eligiblePaidQty })).toBe(5)
  })

  it('calculates free shipping eligible subtotal only for selected suppliers', () => {
    const cart = [
      { id: 'A1', supplier: 'Supplier A', price: 100, qty: 3 },
      { id: 'B1', supplier: 'Supplier B', price: 200, qty: 2 }
    ]
    expect(
      eligibleSubtotalForSupplierScope(cart, {
        multiSupplier: true,
        hasCentralSupplier: false,
        allowedKeys: ['Supplier A']
      })
    ).toBe(300)
  })

  it('qualifies free shipping promotion when selected supplier subtotal reaches minimum', () => {
    const promo = { Type: 'free_shipping_min_purchase', MinPurchase: 300 }
    expect(isFreeShippingPromotionEligible(promo, 300)).toBe(true)
    expect(isFreeShippingPromotionEligible(promo, 299)).toBe(false)
  })

  it('requires explicit suppliers for free shipping in multi-supplier cart without central supplier', () => {
    expect(
      supplierKeysForSupplierScope(['Supplier A', 'Supplier B'], {
        multiSupplier: true,
        hasCentralSupplier: false,
        allowedKeys: null
      })
    ).toEqual([])
  })
})
