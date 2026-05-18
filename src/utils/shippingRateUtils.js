const DEFAULT_SHIPPING_RATE_PER_KG = 50

function toNonNegativeNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/**
 * fallback เมื่อโหลดเรทไม่ได้/ไม่มีเรท: คิดตามทุก 1000 กรัม และมีขั้นต่ำ 50 บาท
 */
export function calculateFallbackShipping(weightGrams) {
  const w = toNonNegativeNumber(weightGrams)
  const byKg = Math.ceil(w / 1000) * DEFAULT_SHIPPING_RATE_PER_KG
  return Math.max(DEFAULT_SHIPPING_RATE_PER_KG, byKg)
}

/**
 * normalize และกรองเรทที่ใช้งานได้
 * schema: { MinWeight, MaxWeight, Price }
 */
export function normalizeShippingRates(rates) {
  return (Array.isArray(rates) ? rates : [])
    .map((r) => ({
      min: Number(r?.MinWeight),
      max: Number(r?.MaxWeight),
      price: Number(r?.Price),
      source: r
    }))
    .filter(
      (r) =>
        Number.isFinite(r.min) &&
        r.min >= 0 &&
        Number.isFinite(r.max) &&
        (r.max === 0 || r.max >= r.min) &&
        Number.isFinite(r.price) &&
        r.price > 0
    )
    .sort((a, b) => (a.min - b.min) || (a.max - b.max))
}

/**
 * เลือกราคาเรทจากน้ำหนักรวม:
 * - ใช้ช่วงแบบ inclusive: min <= w <= max
 * - max = 0 หมายถึงไม่จำกัดบน
 * - ถ้าไม่แมตช์ ใช้เรทปลายสุด (หรือ open-ended ถ้ามี)
 */
export function pickShippingRateCost(weightGrams, rates) {
  const weight = toNonNegativeNumber(weightGrams)
  const validRates = normalizeShippingRates(rates)

  if (validRates.length === 0) {
    return {
      cost: calculateFallbackShipping(weight),
      matchedRate: null,
      validRates
    }
  }

  const matched =
    validRates.find((r) => weight >= r.min && (r.max === 0 || weight <= r.max)) ||
    validRates.find((r) => r.max === 0) ||
    validRates[validRates.length - 1]

  const cost = Number(matched?.price) || calculateFallbackShipping(weight)
  return { cost, matchedRate: matched, validRates }
}

