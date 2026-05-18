/**
 * บรรทัดออเดอร์ + bundle: ชื่อที่แสดง, BUNDLE_IDS สำหรับหัก/คืนสต็อก, สต็อก bundle จากหลัก
 */
import { formatSelectedOptionsSummary } from './helpers'

export const BUNDLE_IDS_MARKER = 'BUNDLE_IDS:'

/** รหัสสินค้าหลักของชุด (flex / sum=primary) */
export function getBundlePrimaryId(product) {
  if (!product) return ''
  return String(product.bundlePrimaryProductId ?? product.BundlePrimaryProductId ?? '').trim()
}

/**
 * สต็อกที่ควรแสดงสำหรับ bundle = สต็อกของสินค้าหลัก (ถ้ามี lookup) ไม่งั้น stock บนแถวชุด
 */
export function getEffectiveStock(product, primaryStockLookup) {
  if (!product) return 0
  const isBundle = Boolean(product.isBundle ?? product.is_bundle)
  if (!isBundle) return Math.max(0, Number(product.stock) || 0)
  const pid = getBundlePrimaryId(product)
  if (!pid || !primaryStockLookup || typeof primaryStockLookup.get !== 'function') {
    return Math.max(0, Number(product.stock) || 0)
  }
  const v = primaryStockLookup.get(pid)
  if (v === undefined || v === null || Number.isNaN(Number(v))) {
    return Math.max(0, Number(product.stock) || 0)
  }
  return Math.max(0, Number(v) || 0)
}

/** รวบรวม ProductID ของสินค้าหลักจากรายการสินค้า (สำหรับดึงสต็อกแบบ batch) */
export function collectBundlePrimaryProductIds(products) {
  const set = new Set()
  ;(products || []).forEach((p) => {
    if (!p) return
    if (p.isBundle !== true && p.is_bundle !== true) return
    const id = getBundlePrimaryId(p)
    if (id) set.add(id)
  })
  return [...set]
}

/** สร้างสตริง BUNDLE_IDS: P001=2,P002=1 */
export function formatBundleIdsString(moves) {
  if (!moves || typeof moves !== 'object') return ''
  const parts = []
  for (const [k, v] of Object.entries(moves)) {
    const id = String(k || '').trim()
    const n = Math.round(Number(v) || 0)
    if (!id || n <= 0) continue
    parts.push(`${id}=${n}`)
  }
  return parts.join(',')
}

/** แยก BUNDLE_IDS จากชื่อแถวที่บันทึกใน order (Itemname) */
export function parseBundleSelectionIdsFromItemName(storedName) {
  const out = new Map()
  const raw = String(storedName ?? '')
  const idx = raw.indexOf(BUNDLE_IDS_MARKER)
  if (idx < 0) return out
  const tail = raw.slice(idx + BUNDLE_IDS_MARKER.length).trim()
  const line = tail.split(/\r?\n/)[0].split('|')[0].trim()
  if (!line) return out
  for (const part of line.split(',')) {
    const seg = String(part).trim()
    if (!seg) continue
    const m = seg.match(/^([^=]+)=(\d+)$/)
    if (m) {
      out.set(String(m[1]).trim(), Math.round(Number(m[2]) || 0))
    }
  }
  return out
}

/** บรรทัดแรกของชื่อแถว (ก่อน newline / ก่อน BUNDLE_IDS) — ใช้จับคู่ FreeItems ฯลฯ */
export function orderItemNameFirstLine(storedName) {
  const s = String(storedName ?? '')
  const cut = s.split(/\r?\n/)[0]
  const i = cut.indexOf(BUNDLE_IDS_MARKER)
  return (i >= 0 ? cut.slice(0, i) : cut).trim()
}

/**
 * แยกเป็นบรรทัดสำหรับแสดงผล — ตัดส่วน BUNDLE_IDS ออกจากแต่ละบรรทัดเมื่อ hideBundleIds
 */
export function formatOrderItemLinesForDisplay(storedName, { hideBundleIds = true } = {}) {
  const raw = String(storedName ?? '').trim()
  if (!raw) return []
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!hideBundleIds) return lines
  return lines
    .map((line) => {
      if (/^BUNDLE_IDS:/i.test(line)) return ''
      const idx = line.indexOf(BUNDLE_IDS_MARKER)
      if (idx >= 0) return line.slice(0, idx).trim()
      return line
    })
    .filter(Boolean)
}

/**
 * ชื่อสินค้าสำหรับ UI (ตารางออเดอร์ / รายงาน) — ไม่แสดง BUNDLE_IDS หรือบรรทัดที่เป็นแต่เฉพาะ bundle id
 */
export function getOrderItemDisplayName(storedName, { multiline = false } = {}) {
  const lines = formatOrderItemLinesForDisplay(storedName, { hideBundleIds: true })
  if (!lines.length) return '-'
  const sep = multiline ? '\n' : ' · '
  return lines.join(sep).trim() || '-'
}

/**
 * freeQty จากแผนที่ FreeItems (คีย์เป็นชื่อสั้นจากตะกร้า — ใช้บรรทัดแรกของชื่อแถวออเดอร์)
 */
export function freeQtyForLineItem(freeItemsMap, storedName) {
  if (!freeItemsMap || typeof freeItemsMap.get !== 'function') return 0
  const first = orderItemNameFirstLine(storedName)
  if (freeItemsMap.has(first)) return Math.max(0, Number(freeItemsMap.get(first)) || 0)
  if (freeItemsMap.has(storedName)) return Math.max(0, Number(freeItemsMap.get(storedName)) || 0)
  return 0
}

/**
 * คำนวณจำนวนหักสต็อกต่อ component จากแถวตะกร้า/ออเดอร์ + ข้อมูลสินค้า (ต้องมี bundleLines สำหรับชุดตายตัว)
 */
export function computeBundleStockMoves(item, product) {
  const moves = {}
  if (!item || !product) return moves

  if (
    item.bundleFlexible === true &&
    item.bundleSelections &&
    typeof item.bundleSelections === 'object' &&
    !Array.isArray(item.bundleSelections)
  ) {
    for (const [pid, raw] of Object.entries(item.bundleSelections)) {
      const id = String(pid || '').trim()
      const n = Math.round(Number(raw) || 0)
      if (!id || n <= 0) continue
      moves[id] = (moves[id] || 0) + n
    }
    return moves
  }

  const qty = Math.round(Number(item.qty) || 0)
  if (qty <= 0) return moves

  if (product.isBundle && Array.isArray(product.bundleLines) && product.bundleLines.length > 0) {
    const step = Math.max(1, Number(product.orderStep) || 1)
    const chunks = qty / step
    for (const line of product.bundleLines) {
      const compId = String(line.productId || '').trim()
      const perChunk = Number(line.qty) || 0
      if (!compId || perChunk <= 0) continue
      const take = Math.round(chunks * perChunk)
      if (take <= 0) continue
      moves[compId] = (moves[compId] || 0) + take
    }
  } else {
    const id = String(item.id || product.id || '').trim()
    if (id) moves[id] = (moves[id] || 0) + qty
  }
  return moves
}

/**
 * ชื่อแถวออเดอร์แบบหลายบรรทัด + BUNDLE_IDS ท้ายบรรทัดสุดท้าย
 */
export function buildOrderLineItemName(item, bundleMoves) {
  const base = String(item?.name ?? '').trim() || 'สินค้า'
  const lines = [base]
  const opt = item?.selectedOptions
  if (opt && typeof opt === 'object' && !Array.isArray(opt) && Object.keys(opt).length) {
    const s = formatSelectedOptionsSummary(opt)
    if (s) lines.push(`ตัวเลือก: ${s}`)
  }
  const bundle = item?.bundleSelectionSummary && String(item.bundleSelectionSummary).trim()
  if (bundle) lines.push(`ชุด: ${bundle}`)
  const ids = formatBundleIdsString(bundleMoves)
  if (ids) lines.push(`${BUNDLE_IDS_MARKER} ${ids}`)
  return lines.join('\n')
}
