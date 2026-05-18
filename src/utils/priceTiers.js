/** ราคาขั้นบันได (PriceTiers) — สูงสุด 4 ขั้น */

export const MAX_PRICE_TIERS = 4

/** แถวว่างในฟอร์มแอดมิน (ราคาขั้นบันได) */
export function emptyPriceTierFormRow() {
  return { minQty: '', price: '', franchisePrice: '' }
}

/**
 * แปลง priceTiers จากสินค้าเป็นแถวฟอร์ม (สูงสุด MAX_PRICE_TIERS)
 */
export function priceTiersToFormRows(priceTiers) {
  if (!Array.isArray(priceTiers) || priceTiers.length === 0) return []
  return priceTiers.slice(0, MAX_PRICE_TIERS).map((t) => ({
    minQty: String(t.minQty ?? ''),
    price: String(t.price ?? ''),
    franchisePrice: t.franchisePrice != null && t.franchisePrice !== '' ? String(t.franchisePrice) : ''
  }))
}

/**
 * ตรวจแถวจากฟอร์ม — minQty ≥ orderStep และเป็นทวีคูณของ orderStep, สูงสุด MAX_PRICE_TIERS ขั้น
 */
export function validatePriceTierFormRows(orderStep, rows) {
  const step = Math.max(1, parseInt(String(orderStep ?? '1'), 10) || 1)
  const list = rows || []
  const built = []
  for (let i = 0; i < list.length; i++) {
    const r = list[i] || {}
    const hasAny =
      String(r.minQty || '').trim() !== '' ||
      String(r.price || '').trim() !== '' ||
      String(r.franchisePrice || '').trim() !== ''
    if (!hasAny) continue
    const minQty = parseInt(String(r.minQty).trim(), 10)
    const price = Number(String(r.price).trim())
    if (!Number.isFinite(minQty) || minQty <= 0 || !Number.isFinite(price)) {
      return {
        ok: false,
        message: `ราคาขั้นบันได แถว ${i + 1}: กรอกจำนวนขั้นต่ำขั้นและราคาต่อหนึ่ง OrderStep ให้ครบถ้วน`
      }
    }
    if (minQty < step || minQty % step !== 0) {
      return {
        ok: false,
        message: `แถว ${i + 1}: จำนวนขั้นต่ำขั้น (${minQty}) ต้อง ≥ OrderStep (${step}) และเป็นทวีคูณของ ${step}`
      }
    }
    const row = { minQty, price: Math.max(0, price) }
    const fStr = String(r.franchisePrice ?? '').trim()
    if (fStr !== '') {
      const fp = Number(fStr)
      if (Number.isFinite(fp) && fp > 0) row.franchisePrice = fp
    }
    built.push(row)
  }
  if (built.length > MAX_PRICE_TIERS) {
    return { ok: false, message: `ราคาขั้นบันไดได้สูงสุด ${MAX_PRICE_TIERS} ขั้น` }
  }
  return { ok: true, tiers: built }
}

function toFiniteNumber(v, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(/\s/g, ''))
  return Number.isFinite(n) ? n : fallback
}

/**
 * อ่านจาก DB / API — คืนอาร์เรย์ { minQty, price, franchisePrice? }
 */
export function parsePriceTiers(raw) {
  if (raw == null || raw === '') return []
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((t) => ({
      minQty: Math.round(toFiniteNumber(t?.minQty, 0)),
      price: Math.max(0, toFiniteNumber(t?.price, 0)),
      franchisePrice:
        t?.franchisePrice === undefined || t?.franchisePrice === null || t?.franchisePrice === ''
          ? undefined
          : Math.max(0, toFiniteNumber(t.franchisePrice, 0)),
      perMinQtyLot:
        t?.perMinQtyLot === true ||
        t?.per_min_qty_lot === true ||
        t?.priceIsLotTotal === true ||
        t?.price_is_lot_total === true ||
        String(t?.pricingMode || '').toLowerCase() === 'perminqtylot'
    }))
    .filter((t) => t.minQty > 0 && t.price >= 0)
    .sort((a, b) => a.minQty - b.minQty)
    .slice(0, MAX_PRICE_TIERS)
}

/**
 * บันทึกลง DB — จำกัด 4 ขั้น, minQty เป็นทวีคูณของ orderStep และ >= orderStep
 */
export function sanitizePriceTiersForDb(tiers, orderStep) {
  const step = Math.max(1, Math.round(Number(orderStep) || 1))
  const list = parsePriceTiers(tiers)
  const out = []
  for (const t of list) {
    if (out.length >= MAX_PRICE_TIERS) break
    const minQty = Math.round(toFiniteNumber(t.minQty, 0))
    if (minQty < step || minQty % step !== 0) continue
    const row = { minQty, price: Math.max(0, toFiniteNumber(t.price, 0)) }
    if (t.franchisePrice !== undefined && t.franchisePrice !== null && t.franchisePrice !== '') {
      const fp = Math.max(0, toFiniteNumber(t.franchisePrice, 0))
      if (fp > 0) row.franchisePrice = fp
    }
    if (t?.perMinQtyLot === true || String(t?.pricingMode || '').toLowerCase() === 'perminqtylot') {
      row.perMinQtyLot = true
    }
    out.push(row)
  }
  out.sort((a, b) => a.minQty - b.minQty)
  return out
}

/**
 * รูปแบบราคาสำหรับคำนวณขั้น — ราคาในแต่ละระดับ = ราคาต่อหนึ่ง OrderStep (เหมือน Price / FranchisePrice)
 */
export function getPricingShapeFromProduct(product) {
  const basis = product?.tierBasis
  if (basis && typeof basis === 'object') {
    return {
      regularPrice: Math.max(
        0,
        toFiniteNumber(
          basis.regularPrice ?? basis.regularStepPrice ?? basis.Price ?? basis.price,
          0
        )
      ),
      franchisePrice: Math.max(
        0,
        toFiniteNumber(basis.franchisePrice ?? basis.franchiseStepPrice ?? basis.FranchisePrice, 0)
      ),
      orderStep: Math.max(1, parseInt(basis.orderStep ?? 1, 10) || 1),
      priceTiers: Array.isArray(basis.priceTiers) ? basis.priceTiers : []
    }
  }
  if (!product) {
    return {
      regularPrice: 0,
      franchisePrice: 0,
      orderStep: 1,
      priceTiers: []
    }
  }
  const orderStep = Math.max(1, parseInt(product.orderStep ?? product.OrderStep ?? 1, 10) || 1)
  const regularPrice = toFiniteNumber(
    product.regularPrice ?? product.regularStepPrice ?? product.Price ?? product.price,
    0
  )
  let franchisePrice = toFiniteNumber(
    product.franchisePrice ?? product.franchiseStepPrice ?? product.FranchisePrice,
    0
  )
  if (!Number.isFinite(franchisePrice) || franchisePrice < 0) franchisePrice = 0
  const priceTiers = Array.isArray(product.priceTiers)
    ? product.priceTiers
    : parsePriceTiers(product.PriceTiers ?? product.price_tiers)
  return {
    orderStep,
    regularPrice: Math.max(0, regularPrice),
    franchisePrice: Math.max(0, franchisePrice),
    priceTiers
  }
}

/**
 * ราคาชุดยืดหยุ่น: ใช้รูปราคาจากสินค้าหลักก่อน (ราคา/ขั้น) ถ้าไม่มีขั้นที่หลักค่อยใช้ของชุด
 * orderStep ยังเป็นของชุด (ใช้หารจำนวนรอบในตะกร้า)
 */
export function getPricingShapeForBundlePrimary(bundle, primary) {
  const primaryShape = getPricingShapeFromProduct(primary || {})
  if (!primary) return primaryShape
  const bundleShape = getPricingShapeFromProduct(bundle || {})
  const primaryHasTiers = parsePriceTiers(primaryShape.priceTiers).length > 0
  const useBundleTiers =
    !primaryHasTiers &&
    parsePriceTiers(bundleShape.priceTiers).length > 0 &&
    String(bundle?.bundlePrimaryProductId || '') === String(primary?.id || '')

  return {
    regularPrice: useBundleTiers ? bundleShape.regularPrice : primaryShape.regularPrice,
    franchisePrice: useBundleTiers ? bundleShape.franchisePrice : primaryShape.franchisePrice,
    orderStep: Math.max(1, Number(primaryShape.orderStep) || 1),
    priceTiers: useBundleTiers ? bundleShape.priceTiers : primaryShape.priceTiers
  }
}

function readBasePrices(shape) {
  const regularPrice = Number(shape?.regularPrice ?? shape?.Price ?? shape?.price ?? 0) || 0
  let franchisePrice = Number(shape?.franchisePrice ?? shape?.FranchisePrice ?? 0) || 0
  if (!Number.isFinite(franchisePrice)) franchisePrice = 0
  return { regularPrice, franchisePrice }
}

function tierStoredPriceToPerUnit(t, shape, userType) {
  const isFr = String(userType || '').toLowerCase() === 'franchise'
  const minQty = Math.max(1, Number(t.minQty) || 1)
  const rawRegular = Number(t.price)
  const rawFr =
    t.franchisePrice != null && t.franchisePrice !== '' && Number.isFinite(Number(t.franchisePrice))
      ? Number(t.franchisePrice)
      : null
  const raw = isFr && rawFr != null && rawFr >= 0 ? rawFr : rawRegular
  if (!Number.isFinite(raw) || raw < 0) return null

  if (t.perMinQtyLot === true) return raw / minQty

  const { regularPrice, franchisePrice } = readBasePrices(shape)
  const base = isFr && franchisePrice > 0 ? franchisePrice : regularPrice
  const divided = raw / minQty
  const likelyLotTotalMisentered =
    base > 0 && minQty > 1 && raw >= base * 10 && divided > 0 && divided < base
  return likelyLotTotalMisentered ? divided : raw
}

/**
 * เลือกราคาต่อหนึ่ง OrderStep จากขั้นที่ minQty สูงสุดที่ qty >= minQty
 * - ค่าเริ่มต้น: ราคาในขั้น = ราคาต่อหนึ่ง OrderStep (perStep)
 * - pricingMode === 'perMinQtyLot': ราคาในขั้น = ยอดรวมสำหรับ minQty หน่วย → แปลงเป็นต่อ OrderStep
 * - heuristic: ถ้าไม่ระบุ mode แต่ราคาขั้นใกล้เคียงยอดรวมของล็อต minQty ให้ถือว่าเป็นยอดรวมล็อตแล้วหาร
 */
export function resolveTieredStepPrice(shape, qty, userType = 'regular') {
  const { regularPrice, franchisePrice } = readBasePrices(shape)
  const q = Number(qty) || 0
  const tiers = parsePriceTiers(shape?.priceTiers ?? shape?.PriceTiers)
  const base =
    String(userType || '').toLowerCase() === 'franchise' && franchisePrice > 0
      ? franchisePrice
      : regularPrice
  if (!tiers.length) return base
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty)
  for (const t of sorted) {
    if (q < t.minQty) continue
    const unitPrice = tierStoredPriceToPerUnit(t, shape, userType)
    if (unitPrice != null && Number.isFinite(unitPrice) && unitPrice >= 0) return unitPrice
  }
  return base
}

/**
 * ราคาต่อหน่วย (หารด้วย OrderStep) + ส่วนเพิ่มจากตัวเลือกต่อหน่วย
 */
export function resolveCartUnitPrice(shape, qty, userType, optionExtraPerUnit = 0) {
  const unitPrice = resolveTieredStepPrice(shape, qty, userType)
  const extra = Math.max(0, Number(optionExtraPerUnit) || 0)
  return unitPrice + extra
}
