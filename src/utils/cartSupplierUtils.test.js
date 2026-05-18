import { describe, it, expect } from 'vitest'
import { linePaidSubtotal, getSelectedOptionsExtraPerUnit } from './cartSupplierUtils'

/** สอดคล้องกับ Checkout.jsx orderLineUnitPrice */
function orderLineUnitPrice(item) {
  const opt = getSelectedOptionsExtraPerUnit(item)
  const base = Number(item.price || 0)
  if (item.bundleFlexible === true && item.bundlePrimaryProductId) {
    const step = Math.max(1, Number(item.orderStep) || 1)
    const sel = item.bundleSelections && typeof item.bundleSelections === 'object' ? item.bundleSelections : {}
    const pq = Math.round(Number(sel[item.bundlePrimaryProductId]) || Number(item.qty) || 0)
    if (pq <= 0) return opt
    const batches = pq / step
    return (base * batches + opt * pq) / pq
  }
  return base + opt
}

describe('linePaidSubtotal vs checkout unit price', () => {
  it('non-bundle: paid = (unit + option) * qty', () => {
    const item = {
      price: 3.5,
      qty: 2000,
      orderStep: 1000,
      productOptions: [{ name: 'สี', values: [{ label: 'แดง', price: 0.5 }] }],
      selectedOptions: { สี: 'แดง' }
    }
    expect(linePaidSubtotal(item)).toBeCloseTo((3.5 + 0.5) * 2000, 5)
    expect(orderLineUnitPrice(item) * item.qty).toBeCloseTo(linePaidSubtotal(item), 5)
  })

  it('flex bundle: paid = stepPrice * batches + option * primaryQty', () => {
    const item = {
      bundleFlexible: true,
      bundlePrimaryProductId: 'P1',
      orderStep: 1000,
      price: 4000,
      qty: 2000,
      bundleSelections: { P1: 2000 },
      productOptions: [{ name: 'สี', values: [{ label: 'แดง', price: 5 }] }],
      selectedOptions: { สี: 'แดง' }
    }
    expect(linePaidSubtotal(item)).toBe(4000 * 2 + 5 * 2000)
    expect(orderLineUnitPrice(item) * 2000).toBe(linePaidSubtotal(item))
  })
})
