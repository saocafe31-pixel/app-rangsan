/**
 * คูปอง/โปรหลาย Supplier:
 * - DB AllowedSupplierKeys = null/ว่าง → กฎอัตโนมัติ: มี "ส่วนกลาง" ในตะกร้า → ส่วนลดไปที่บรรทัดออเดอร์ของส่วนกลางเท่านั้น
 * - หลาย Supplier โดยไม่มีส่วนกลาง → ต้องตั้ง AllowedSupplierKeys ในแอดมิน แล้วตะกร้าต้องมีซัพที่ตรงกลุ่มนั้น
 * - ตั้ง AllowedSupplierKeys แล้ว → แบ่งส่วนลดเฉพาะกลุ่มที่ supplierKey อยู่ในรายการ
 */
import { normalizeSupplierName, CENTRAL_SUPPLIER_LABEL } from './orderSupplierUtils'
import { getItemSupplierKey, linePaidSubtotal } from './cartSupplierUtils'

/** อ่านค่าจากคอลัมน์ jsonb / array / string JSON */
export function parseAllowedSupplierKeys(raw) {
  if (raw == null) return null
  if (Array.isArray(raw)) {
    const out = raw.map((x) => normalizeSupplierName(x)).filter(Boolean)
    return out.length ? out : null
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return null
    try {
      const parsed = JSON.parse(t)
      return parseAllowedSupplierKeys(parsed)
    } catch {
      return null
    }
  }
  return null
}

export function sortSupplierGroupsForCheckout(groups) {
  if (!groups || groups.length <= 1) return groups || []
  return [...groups].sort((a, b) => {
    const ac = a.supplierKey === CENTRAL_SUPPLIER_LABEL ? 0 : 1
    const bc = b.supplierKey === CENTRAL_SUPPLIER_LABEL ? 0 : 1
    if (ac !== bc) return ac - bc
    return String(a.supplierLabel || '').localeCompare(String(b.supplierLabel || ''), 'th')
  })
}

/** ตะกร้าหลายซัพไม่มีส่วนกลาง และไม่ได้ระบุ AllowedSupplierKeys → ใช้คูปองไม่ได้ */
export function validateCouponSupplierScope({ multiSupplier, hasCentralSupplier, allowedKeys, cartSupplierKeys }) {
  if (!multiSupplier) return { ok: true }
  const allowed = allowedKeys?.length ? new Set(allowedKeys.map((k) => normalizeSupplierName(k))) : null

  if (hasCentralSupplier) {
    if (!allowed || allowed.size === 0) return { ok: true }
    const hit = cartSupplierKeys.some((ck) => allowed.has(normalizeSupplierName(ck)))
    return hit
      ? { ok: true }
      : {
          ok: false,
          message: 'คูปองนี้จำกัด Supplier ที่ไม่ตรงกับสินค้าในตะกร้า'
        }
  }

  if (!allowed || allowed.size === 0) {
    return {
      ok: false,
      message:
        'ตะกร้ามีหลาย Supplier โดยไม่มีสินค้าส่วนกลาง — กรุณาให้แอดมินกำหนด "Supplier ที่ใช้คูปองได้" สำหรับโค้ดนี้ หรือเพิ่มสินค้าส่วนกลางในตะกร้า'
    }
  }

  const hit = cartSupplierKeys.some((ck) => allowed.has(normalizeSupplierName(ck)))
  return hit
    ? { ok: true }
    : {
        ok: false,
        message: 'คูปองนี้จำกัด Supplier ที่ไม่ตรงกับสินค้าในตะกร้า'
      }
}

export function promotionAllowedForProductSupplier({
  multiSupplier,
  hasCentralSupplier,
  allowedKeys,
  productSupplierKey
}) {
  if (!multiSupplier) return true
  const pk = normalizeSupplierName(productSupplierKey)
  const allowed = allowedKeys?.length ? new Set(allowedKeys.map((k) => normalizeSupplierName(k))) : null

  if (hasCentralSupplier) {
    if (!allowed || allowed.size === 0) return true
    return allowed.has(pk)
  }

  if (!allowed || allowed.size === 0) return false
  return allowed.has(pk)
}

/** น้ำหนักสำหรับ splitMoneyPool — ใช้ paidSubtotal ของแต่ละกลุ่ม */
export function discountSplitRatios(supplierKeys, paidSubtotals, { multiSupplier, hasCentralSupplier, allowedKeys }) {
  const n = supplierKeys.length
  if (n === 0) return []
  if (!multiSupplier) {
    return paidSubtotals.map((p) => Math.max(0, Number(p) || 0))
  }

  const paid = paidSubtotals.map((p) => Math.max(0, Number(p) || 0))
  const allowed =
    allowedKeys && allowedKeys.length > 0
      ? new Set(allowedKeys.map((k) => normalizeSupplierName(k)))
      : null

  let weights
  if (allowed && allowed.size > 0) {
    weights = supplierKeys.map((k, i) => (allowed.has(normalizeSupplierName(k)) ? paid[i] : 0))
  } else if (hasCentralSupplier) {
    weights = supplierKeys.map((k, i) =>
      normalizeSupplierName(k) === CENTRAL_SUPPLIER_LABEL ? paid[i] : 0
    )
  } else {
    weights = paid.slice()
  }

  const sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW <= 0) return paid.map((p) => (p > 0 ? p : 1))
  return weights
}

/**
 * ยอดที่ใช้คำนวณมูลค่าส่วนลดจากคูปองเมื่อตะกร้าหลายซัพ (เปอร์เซ็นต์/เพดาน)
 * — จำกัดเฉพาะบรรทัดที่เข้าข่ายตามกฎซัพ
 */
export function eligibleSubtotalForCoupon(cart, { multiSupplier, hasCentralSupplier, allowedKeys }) {
  const sumLine = (item) => linePaidSubtotal(item)
  if (!cart || cart.length === 0) return 0
  if (!multiSupplier) {
    return cart.reduce((s, i) => s + sumLine(i), 0)
  }
  const allowed =
    allowedKeys && allowedKeys.length > 0
      ? new Set(allowedKeys.map((k) => normalizeSupplierName(k)))
      : null

  if (allowed && allowed.size > 0) {
    return cart.reduce((s, i) => {
      const k = normalizeSupplierName(getItemSupplierKey(i))
      return allowed.has(k) ? s + sumLine(i) : s
    }, 0)
  }

  if (hasCentralSupplier) {
    return cart.reduce((s, i) => {
      const k = normalizeSupplierName(getItemSupplierKey(i))
      return k === CENTRAL_SUPPLIER_LABEL ? s + sumLine(i) : s
    }, 0)
  }

  return cart.reduce((s, i) => s + sumLine(i), 0)
}

export function unionAllowedKeysFromPromotions(promotions) {
  const lists = (promotions || [])
    .map((p) => parseAllowedSupplierKeys(p.AllowedSupplierKeys))
    .filter((a) => a && a.length > 0)
  if (lists.length === 0) return null
  const u = new Set()
  lists.flat().forEach((k) => u.add(normalizeSupplierName(k)))
  return [...u]
}
