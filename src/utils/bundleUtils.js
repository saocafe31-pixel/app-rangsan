/**
 * จำนวนสูงสุดที่ลูกค้าสั่งได้ (เป็นผลคูณของ orderStep) สำหรับสินค้าชุด
 * แต่ละแถว BundleLines = จำนวนที่ตัดจากส่วนประกอบต่อ 1 รอบของ orderStep
 */
export function maxBundleOrderQty(bundleProduct, bundleLines, productsById) {
  const step = Math.max(1, Number(bundleProduct?.orderStep) || 1)
  const lines = Array.isArray(bundleLines) ? bundleLines : []
  if (lines.length === 0) return Math.max(0, Number(bundleProduct?.stock) || 0)

  let maxChunks = Infinity
  for (const line of lines) {
    const pid = String(line.productId || '').trim()
    const need = Number(line.qty) || 0
    if (!pid || need <= 0) continue
    const comp = typeof productsById.get === 'function' ? productsById.get(pid) : null
    const stk = Number(comp?.stock) || 0
    maxChunks = Math.min(maxChunks, Math.floor(stk / need))
  }
  if (!Number.isFinite(maxChunks) || maxChunks < 0) return 0
  return maxChunks * step
}

// SAO-compatible alias
export const calculateMaxBundleOrderQty = maxBundleOrderQty

/** ปรับจำนวนให้หาร compStep ลงตัว (0 ยังเป็น 0) — ใช้กับช่องกรอกชุด */
export function snapBundleQtyToStep(q, compStep) {
  const s = Math.max(1, Number(compStep) || 1)
  const n = Math.round(Number(q) || 0)
  if (n <= 0) return 0
  return Math.round(n / s) * s
}

export function mergeBundleSelections(a = {}, b = {}) {
  const out = { ...(a && typeof a === 'object' ? a : {}) }
  for (const [k, v] of Object.entries(b && typeof b === 'object' ? b : {})) {
    out[k] = (Number(out[k]) || 0) + (Number(v) || 0)
  }
  return out
}

/** ตรวจจำนวนแต่ละรหัสในชุดแบบยืดหยุ่น + จำนวนหลักหาร orderStep ลงตัว */
export function validateFlexibleBundleSelections(product, selections, productsById) {
  const lines = Array.isArray(product?.bundleLines) ? product.bundleLines : []
  const primary = String(product?.bundlePrimaryProductId || '').trim()
  const step = Math.max(1, Number(product?.orderStep) || 1)
  const get = typeof productsById?.get === 'function' ? (id) => productsById.get(id) : () => null

  if (!primary || !lines.some((l) => String(l.productId || '').trim() === primary)) {
    return { ok: false, message: 'ชุดแบบกำหนดเองยังไม่ได้ตั้งรหัสส่วนประกอบหลัก (แอดมิน)' }
  }
  if (!lines.length) {
    return { ok: false, message: 'ไม่มีรายการส่วนประกอบในชุด' }
  }

  for (const line of lines) {
    const pid = String(line.productId || '').trim()
    if (!pid) continue
    const q = Math.round(Number(selections?.[pid]))
    if (!Number.isFinite(q) || q < 0) {
      return { ok: false, message: 'กรุณาระบุจำนวนเป็นจำนวนเต็มไม่ติดลบ' }
    }
    const comp = get(pid)
    const stk = Number(comp?.stock) || 0
    if (q > stk) {
      return { ok: false, message: `${comp?.name || pid} สต็อกเหลือ ${stk}` }
    }
    const compStep = pid === primary ? step : Math.max(1, Number(comp?.orderStep) || 1)
    if (q > 0 && q % compStep !== 0) {
      return {
        ok: false,
        message: `${comp?.name || pid} ต้องสั่งทีละ ${compStep} (จำนวนต้องหาร ${compStep} ลงตัว)`
      }
    }
  }

  const pq = Math.round(Number(selections?.[primary]))
  if (!Number.isFinite(pq) || pq <= 0) {
    return { ok: false, message: 'ระบุจำนวนส่วนประกอบหลักให้มากกว่า 0' }
  }

  if (product.bundleComponentSumEqualsPrimary) {
    const pids = [...new Set(lines.map((l) => String(l.productId || '').trim()).filter(Boolean))]
    const secondaries = pids.filter((pid) => pid !== primary)
    if (secondaries.length > 0) {
      let sumSecondary = 0
      for (const pid of secondaries) {
        sumSecondary += Math.round(Number(selections?.[pid]) || 0)
      }
      if (sumSecondary !== pq) {
        return {
          ok: false,
          message: `ผลรวมส่วนประกอบ (ไม่รวมหลัก) ต้องเท่าจำนวนสินค้าหลัก ${pq} — ตอนนี้รวม ${sumSecondary}`
        }
      }
    }
  }

  return { ok: true }
}

export function formatBundleSelectionsSummary(product, selections, productsById) {
  const lines = Array.isArray(product?.bundleLines) ? product.bundleLines : []
  const get = typeof productsById?.get === 'function' ? (id) => productsById.get(id) : () => null
  return lines
    .map((l) => {
      const pid = String(l.productId || '').trim()
      if (!pid) return null
      const q = Math.round(Number(selections?.[pid]))
      if (!q) return null
      const comp = get(pid)
      return `${comp?.name || pid} ×${q}`
    })
    .filter(Boolean)
    .join(', ')
}

// SAO-compatible alias
export function buildBundleSelectionSummary(selections, productById) {
  const rows = []
  const map = typeof productById?.get === 'function' ? productById : new Map()
  for (const [pid, rawQty] of Object.entries(selections || {})) {
    const qty = Math.round(Number(rawQty) || 0)
    if (qty <= 0) continue
    const name = map.get(pid)?.name || pid
    rows.push(`${name} x${qty}`)
  }
  return rows.join(', ')
}
