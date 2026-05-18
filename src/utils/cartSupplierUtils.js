import { normalizeSupplierName } from './orderSupplierUtils'

export function getProductSupplierKey(product) {
  return normalizeSupplierName(product?.supplier ?? product?.Supplier)
}

export function getItemSupplierKey(item) {
  if (item?.supplierKey) return item.supplierKey
  return normalizeSupplierName(item?.supplier ?? item?.Supplier)
}

/** รายการคีย์ซัพที่มีในตะกร้า (ไม่ซ้ำ) */
export function getDistinctSupplierKeysInCart(cart) {
  const set = new Set()
  ;(cart || []).forEach((i) => set.add(getItemSupplierKey(i)))
  return [...set]
}

/** ตะกร้ามีสินค้าอยู่แล้ว และสินค้าใหม่เป็นซัพคนละกลุ่ม */
export function cartWouldAddDifferentSupplier(cart, product) {
  if (!cart || cart.length === 0) return false
  const newKey = getProductSupplierKey(product)
  const keys = getDistinctSupplierKeysInCart(cart)
  return !keys.includes(newKey)
}

export function linePaidSubtotal(item) {
  const price = Number(item.price || 0)
  const optionExtraPerUnit = getSelectedOptionsExtraPerUnit(item)
  const freeQty = item.freeQty || 0
  const isFree = item.isFree && freeQty > 0

  if (item.bundleFlexible && item.bundlePrimaryProductId) {
    const sel = item.bundleSelections && typeof item.bundleSelections === 'object' ? item.bundleSelections : {}
    const pq = Number(sel[item.bundlePrimaryProductId])
    const primaryQty =
      Number.isFinite(pq) && pq > 0 ? pq : Math.round(Number(item.qty) || 0)
    const paidPrimaryUnits = isFree ? Math.max(0, primaryQty - freeQty) : primaryQty
    return (price + optionExtraPerUnit) * paidPrimaryUnits
  }

  const paidQty = isFree ? Math.max(0, (item.qty || 0) - freeQty) : (item.qty || 0)
  return (price + optionExtraPerUnit) * paidQty
}

export function getSelectedOptionsExtraPerUnit(item) {
  const selected =
    item?.selectedOptions && typeof item.selectedOptions === 'object' && !Array.isArray(item.selectedOptions)
      ? item.selectedOptions
      : null
  const defs = Array.isArray(item?.productOptions) ? item.productOptions : null
  if (!selected || !defs || defs.length === 0) return 0

  let extra = 0
  for (const [optName, selectedLabelRaw] of Object.entries(selected)) {
    const selectedLabel = String(selectedLabelRaw ?? '').trim()
    if (!selectedLabel) continue
    const def = defs.find((d) => String(d?.name ?? '').trim() === optName)
    if (!def || !Array.isArray(def.values)) continue
    const matched = def.values.find((v) => String(v?.label ?? '').trim() === selectedLabel)
    if (!matched) continue
    extra += Math.max(0, Number(matched.price) || 0)
  }
  return extra
}

/** น้ำหนักรวมของแถวตะกร้า (กรัม) */
export function cartLineWeightGrams(item) {
  const w = Number(item.weight) || 0
  if (item.bundleFlexible && item.bundlePrimaryProductId) {
    const sel = item.bundleSelections && typeof item.bundleSelections === 'object' ? item.bundleSelections : {}
    const pq = Number(sel[item.bundlePrimaryProductId])
    const primaryQty =
      Number.isFinite(pq) && pq > 0 ? pq : Math.round(Number(item.qty) || 0)
    return w * primaryQty
  }
  return w * (Number(item.qty) || 0)
}

export function groupCartItemsBySupplier(cart) {
  const map = new Map()
  ;(cart || []).forEach((item) => {
    const key = getItemSupplierKey(item)
    if (!map.has(key)) {
      map.set(key, {
        supplierKey: key,
        supplierLabel: (item.supplier && String(item.supplier).trim()) || key,
        items: []
      })
    }
    map.get(key).items.push(item)
  })
  return Array.from(map.values())
}
