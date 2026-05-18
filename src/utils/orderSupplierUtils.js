/** ซัพพลายเออร์ส่วนกลาง — สินค้าที่จัดเตรียม/แพ็กตามปกติ */
export const CENTRAL_SUPPLIER_LABEL = 'ส่วนกลาง'

export function normalizeSupplierName(raw) {
  const s = (raw == null ? '' : String(raw)).trim()
  return s === '' ? CENTRAL_SUPPLIER_LABEL : s
}

export function isCentralSupplier(supplierName) {
  return normalizeSupplierName(supplierName) === CENTRAL_SUPPLIER_LABEL
}

/**
 * สร้าง lookup จากรายการสินค้า (normalizeProduct หรือแถวจาก products)
 * @param {Array<{ id?: string, name?: string, supplier?: string }>} products
 */
export function buildProductSupplierLookups(products) {
  const byId = new Map()
  const byName = new Map()
  ;(products || []).forEach((p) => {
    const id = (p.id || p.ProductID || '').toString().trim()
    const name = (p.name || p.ProductName || '').toString().trim()
    const sup = normalizeSupplierName(p.supplier ?? p.Supplier)
    if (id) byId.set(id, sup)
    if (name) byName.set(name, sup)
  })
  return { byId, byName }
}

export function getItemSupplier(item, lookups) {
  if (!lookups) return CENTRAL_SUPPLIER_LABEL
  const pid = (item.id || item.productId || item.ProductID || '').toString().trim()
  if (pid && lookups.byId.has(pid)) {
    return normalizeSupplierName(lookups.byId.get(pid))
  }
  const n = (item.name || item.Name || '').toString().trim()
  if (n && lookups.byName.has(n)) {
    return normalizeSupplierName(lookups.byName.get(n))
  }
  return CENTRAL_SUPPLIER_LABEL
}

/** true = ออเดอร์นี้ส่งของส่วนกลางทั้งใบ (แพ็ก/จัดเตรียมได้) — มีสินค้าซัพอื่นปนถือว่า false */
export function isOrderCentralFulfillment(order, lookups) {
  const items = order?.Items || order?.items
  if (!items || items.length === 0) return true
  return items.every((it) => isCentralSupplier(getItemSupplier(it, lookups)))
}

export function uniqueSuppliersFromProducts(products) {
  const set = new Set()
  ;(products || []).forEach((p) => {
    set.add(normalizeSupplierName(p.supplier ?? p.Supplier))
  })
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'))
}
