import { describe, it, expect } from 'vitest'
import {
  calculateFallbackShipping,
  normalizeShippingRates,
  pickShippingRateCost
} from './shippingRateUtils'

describe('shippingRateUtils', () => {
  it('matches boundary when weight equals MaxWeight (inclusive upper bound)', () => {
    const rates = [
      { MinWeight: 0, MaxWeight: 1000, Price: 50 },
      { MinWeight: 1001, MaxWeight: 2000, Price: 80 }
    ]

    const result = pickShippingRateCost(1000, rates)
    expect(result.cost).toBe(50)
    expect(result.matchedRate?.min).toBe(0)
    expect(result.matchedRate?.max).toBe(1000)
  })

  it('uses open-ended range when MaxWeight is 0', () => {
    const rates = [
      { MinWeight: 0, MaxWeight: 1000, Price: 50 },
      { MinWeight: 1001, MaxWeight: 0, Price: 120 }
    ]

    const result = pickShippingRateCost(9000, rates)
    expect(result.cost).toBe(120)
    expect(result.matchedRate?.max).toBe(0)
  })

  it('falls back to highest available range when rates are not contiguous', () => {
    const rates = [
      { MinWeight: 0, MaxWeight: 1000, Price: 50 },
      { MinWeight: 3000, MaxWeight: 5000, Price: 140 }
    ]

    // gap: 1001..2999, should fallback to last known range price
    const result = pickShippingRateCost(2500, rates)
    expect(result.cost).toBe(140)
    expect(result.matchedRate?.min).toBe(3000)
    expect(result.matchedRate?.max).toBe(5000)
  })

  it('normalizes and removes invalid rows', () => {
    const rates = [
      { MinWeight: -1, MaxWeight: 1000, Price: 50 }, // invalid min
      { MinWeight: 0, MaxWeight: 1000, Price: 50 }, // valid
      { MinWeight: 1001, MaxWeight: 1000, Price: 80 }, // invalid max < min
      { MinWeight: 1001, MaxWeight: 0, Price: 120 }, // valid open-ended
      { MinWeight: 2000, MaxWeight: 3000, Price: 0 } // invalid price
    ]

    const normalized = normalizeShippingRates(rates)
    expect(normalized).toHaveLength(2)
    expect(normalized[0]).toMatchObject({ min: 0, max: 1000, price: 50 })
    expect(normalized[1]).toMatchObject({ min: 1001, max: 0, price: 120 })
  })

  it('uses fallback pricing when no valid shipping rates exist', () => {
    const result = pickShippingRateCost(1200, [])
    expect(result.cost).toBe(calculateFallbackShipping(1200))
    expect(result.matchedRate).toBeNull()
  })
})

