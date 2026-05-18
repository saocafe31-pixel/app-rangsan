import { describe, it, expect } from 'vitest'
import {
  MAX_PRICE_TIERS,
  resolveTieredStepPrice,
  resolveCartUnitPrice,
  sanitizePriceTiersForDb,
  parsePriceTiers,
  validatePriceTierFormRows,
  priceTiersToFormRows
} from './priceTiers'

describe('resolveTieredStepPrice', () => {
  const shape = {
    orderStep: 1000,
    regularPrice: 4,
    franchisePrice: 0,
    priceTiers: [
      { minQty: 2000, price: 3.2 },
      { minQty: 4000, price: 3.0, franchisePrice: 2.9 }
    ]
  }

  it('uses base step price when qty below first tier', () => {
    expect(resolveTieredStepPrice(shape, 1000, 'regular')).toBe(4)
  })

  it('uses tier price when qty meets minQty', () => {
    expect(resolveTieredStepPrice(shape, 2000, 'regular')).toBe(3.2)
    expect(resolveTieredStepPrice(shape, 3500, 'regular')).toBe(3.2)
  })

  it('picks highest qualifying tier', () => {
    expect(resolveTieredStepPrice(shape, 4000, 'regular')).toBe(3.0)
  })

  it('uses franchise tier price when set', () => {
    expect(resolveTieredStepPrice(shape, 4000, 'franchise')).toBe(2.9)
  })
})

describe('resolveCartUnitPrice', () => {
  it('adds option extra per unit', () => {
    const shape = {
      orderStep: 1000,
      regularPrice: 3,
      franchisePrice: 0,
      priceTiers: []
    }
    expect(resolveCartUnitPrice(shape, 1000, 'regular', 5)).toBe(8)
  })
})

describe('sanitizePriceTiersForDb', () => {
  it('caps at MAX_PRICE_TIERS', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      minQty: (i + 1) * 1000,
      price: 100 + i
    }))
    expect(sanitizePriceTiersForDb(many, 1000).length).toBe(MAX_PRICE_TIERS)
  })

  it('drops tiers where minQty is not multiple of orderStep', () => {
    const out = sanitizePriceTiersForDb([{ minQty: 1500, price: 1 }], 1000)
    expect(out).toEqual([])
  })
})

describe('parsePriceTiers', () => {
  it('parses JSON string', () => {
    const raw = JSON.stringify([{ minQty: 2000, price: 99 }])
    expect(parsePriceTiers(raw)).toEqual([{ minQty: 2000, price: 99, franchisePrice: undefined, perMinQtyLot: false }])
  })
})

describe('validatePriceTierFormRows', () => {
  it('accepts valid row', () => {
    const r = validatePriceTierFormRows('1000', [{ minQty: '2000', price: '50', franchisePrice: '' }])
    expect(r.ok).toBe(true)
    expect(r.tiers).toEqual([{ minQty: 2000, price: 50 }])
  })

  it('rejects minQty not multiple of step', () => {
    const r = validatePriceTierFormRows('1000', [{ minQty: '1500', price: '1' }])
    expect(r.ok).toBe(false)
  })
})

describe('priceTiersToFormRows', () => {
  it('maps DB tiers to form strings', () => {
    expect(priceTiersToFormRows([{ minQty: 2000, price: 10, franchisePrice: 9 }])).toEqual([
      { minQty: '2000', price: '10', franchisePrice: '9' }
    ])
  })
})
