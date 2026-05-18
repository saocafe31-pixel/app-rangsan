import { describe, expect, it } from 'vitest'
import { linePaidSubtotal, getSelectedOptionsExtraPerUnit } from './cartSupplierUtils'

function saoLinePaidSubtotal(item) {
  const price = Number(item.price || 0)
  const optionExtraPerUnit = Number(getSelectedOptionsExtraPerUnit(item) || 0)
  const freeQty = item.freeQty || 0
  const isFree = item.isFree && freeQty > 0

  if (item.bundleFlexible && item.bundlePrimaryProductId) {
    const sel = item.bundleSelections && typeof item.bundleSelections === 'object' ? item.bundleSelections : {}
    const pq = Number(sel[item.bundlePrimaryProductId])
    const primaryQty = Number.isFinite(pq) && pq > 0 ? pq : Math.round(Number(item.qty) || 0)
    const paidPrimaryUnits = isFree ? Math.max(0, primaryQty - freeQty) : primaryQty
    return (price + optionExtraPerUnit) * paidPrimaryUnits
  }

  const paidQty = isFree ? Math.max(0, (item.qty || 0) - freeQty) : item.qty || 0
  return (price + optionExtraPerUnit) * paidQty
}

describe('pricing parity with SAO model', () => {
  it('fixed bundle / normal line subtotal and checkout total match SAO formula', () => {
    const item = {
      price: 3.8,
      qty: 2000,
      selectedOptions: {},
      productOptions: []
    }
    const subtotalRangsan = linePaidSubtotal(item)
    const subtotalSao = saoLinePaidSubtotal(item)
    expect(subtotalRangsan).toBe(subtotalSao)

    const discount = 120
    const shipping = 60
    const checkoutTotalRangsan = subtotalRangsan - discount + shipping
    const checkoutTotalSao = subtotalSao - discount + shipping
    expect(checkoutTotalRangsan).toBe(checkoutTotalSao)
  })

  it('flexible bundle subtotal / admin line formula match SAO', () => {
    const item = {
      price: 3.8,
      qty: 1000,
      bundleFlexible: true,
      bundlePrimaryProductId: 'P1',
      bundleSelections: { P1: 1000, P2: 500 },
      selectedOptions: { พิมพ์โลโก้: '1 สี' },
      productOptions: [{ name: 'พิมพ์โลโก้', values: [{ label: '1 สี', price: 0.2 }] }]
    }
    const subtotalRangsan = linePaidSubtotal(item)
    const subtotalSao = saoLinePaidSubtotal(item)
    expect(subtotalRangsan).toBe(subtotalSao)

    const paidQty = 1000
    const optionExtra = getSelectedOptionsExtraPerUnit(item)
    const adminLineSubtotal = (Number(item.price || 0) + optionExtra) * paidQty
    expect(subtotalRangsan).toBe(adminLineSubtotal)
  })
})
