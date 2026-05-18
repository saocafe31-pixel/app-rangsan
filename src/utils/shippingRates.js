/**
 * อัตราค่าจัดส่งจากตาราง shipping_rates
 * PostgREST/Supabase มักคืนชื่อคอลัมน์เป็น lowercase — ต้อง normalize ก่อนคำนวณ
 *
 * กฎช่วงน้ำหนัก:
 * - Min=0, Max=0 = เฉพาะน้ำหนัก 0 ก.
 * - Max=0 และ Min>0 = ช่วงเปิดด้านบน [Min, ∞)
 * - ช่วงปิด: [Min, Max]
 * - ถ้าตกหลายช่วง ให้ใช้ช่วงที่ MinWeight สูงกว่า
 */

export function normalizeShippingRateRow(r) {
  if (!r || typeof r !== 'object') return null
  const MinWeight = Number(r.MinWeight ?? r.minweight ?? r.min_weight ?? 0)
  const MaxWeight = Number(r.MaxWeight ?? r.maxweight ?? r.max_weight ?? 0)
  const Price = Number(r.Price ?? r.price ?? 0)
  return {
    id: r.id,
    MinWeight: Number.isFinite(MinWeight) ? MinWeight : 0,
    MaxWeight: Number.isFinite(MaxWeight) ? MaxWeight : 0,
    Price: Number.isFinite(Price) ? Price : 0
  }
}

/**
 * @param {number} weightGrams
 * @param {Array<object>} rawRates
 * @returns {{ cost: number, usedTable: boolean }}
 */
export function shippingCostForWeightGrams(weightGrams, rawRates) {
  const weight = Math.max(0, Number(weightGrams) || 0)
  if (weight <= 0) {
    return { cost: 0, usedTable: true }
  }

  const rows = (rawRates || []).map(normalizeShippingRateRow).filter(Boolean)
  const validRates = rows.filter(
    (rate) =>
      rate.MinWeight >= 0 &&
      (rate.MaxWeight === 0 || rate.MaxWeight > rate.MinWeight) &&
      Number.isFinite(rate.Price) &&
      rate.Price >= 0
  )

  if (validRates.length === 0) {
    return { cost: 0, usedTable: false }
  }

  const rateContainsWeight = (w, rate) => {
    if (w < rate.MinWeight) return false
    if (rate.MinWeight === 0 && rate.MaxWeight === 0) return w === 0
    if (rate.MaxWeight === 0) return rate.MinWeight > 0
    return w <= rate.MaxWeight
  }

  const matches = validRates.filter((r) => rateContainsWeight(weight, r))
  if (matches.length > 0) {
    const best = matches.reduce((a, b) => {
      if (b.MinWeight !== a.MinWeight) return b.MinWeight > a.MinWeight ? b : a
      const aClosed = a.MaxWeight > 0 && weight <= a.MaxWeight
      const bClosed = b.MaxWeight > 0 && weight <= b.MaxWeight
      if (aClosed && !bClosed) return a
      if (!aClosed && bClosed) return b
      if (aClosed && bClosed && b.MaxWeight !== a.MaxWeight) return b.MaxWeight < a.MaxWeight ? b : a
      if (b.Price !== a.Price) return b.Price > a.Price ? b : a
      return b.MaxWeight > a.MaxWeight ? b : a
    })
    return { cost: best.Price, usedTable: true }
  }

  const bounded = validRates.filter((r) => r.MaxWeight > 0)
  const topTier =
    bounded.length > 0
      ? bounded.reduce((a, b) =>
          b.MinWeight > a.MinWeight ? b : b.MinWeight === a.MinWeight && b.MaxWeight > a.MaxWeight ? b : a
        )
      : validRates.reduce((a, b) => (b.MinWeight > a.MinWeight ? b : a))

  return { cost: topTier.Price, usedTable: true }
}
