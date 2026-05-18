import { parsePriceTiers } from './priceTiers'

/** Escape `%` `_` `\` สำหรับ PostgREST `.ilike()` ให้จับคู่ทั้งสตริง (ไม่ใช้ wildcard) */
export function escapeForIlikeExact(value) {
  if (value == null || value === '') return ''
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

/**
 * ครอบค่าใน filter / or() ของ PostgREST — ค่าที่มี `.` `,` `()` ต้องอยู่ใน double quotes
 * ไม่งั้นตัวแยก syntax จะพัง (เช่น ชื่อสินค้า "1.9 กก." จะถูกตัดที่จุด)
 * @see https://postgrest.org/en/stable/references/api/tables_views.html#reserved-characters
 */
export function quotePostgrestFilterValue(value) {
  const s = String(value ?? '')
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '""')}"`
}

/**
 * สร้างชุด or() ค้นหาข้อความในหลายคอลัมน์สินค้า (ใช้กับ .or(...) ของ Supabase)
 */
export function buildProductTextSearchOrFilter(rawSearch) {
  const term = String(rawSearch ?? '').trim()
  if (!term) return null
  const inner = term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const pattern = `%${inner}%`
  const q = quotePostgrestFilterValue(pattern)
  return `ProductName.ilike.${q},Category.ilike.${q},Supplier.ilike.${q},ProductID.ilike.${q}`
}

/** แยกอีเมลจากข้อความในฟอร์ม (บรรทัด / จุลภาค / เว้นวรรค) */
export function parseAllowedViewerEmailsFromText(text) {
  if (!text || typeof text !== 'string') return []
  return [...new Set(
    text.split(/[\s,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )]
}

/** อ่านค่าจาก DB (JSON array หรือข้อความ) */
export function parseAllowedViewerEmailsFromDb(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw)
      if (Array.isArray(j)) {
        return j.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      }
    } catch {
      return parseAllowedViewerEmailsFromText(raw)
    }
  }
  return []
}

/** เก็บลงคอลัมน์ text เป็น JSON; คืน null ถ้าว่าง */
export function serializeAllowedViewerEmailsToJson(text) {
  const arr = parseAllowedViewerEmailsFromText(text || '')
  if (arr.length === 0) return null
  return JSON.stringify(arr)
}

export function allowedViewerEmailsToFormText(emails) {
  if (!emails || !emails.length) return ''
  return emails.join(', ')
}

/** เพิ่มอีเมลลงในข้อความรายการ (ไม่ซ้ำ) */
export function mergeEmailIntoAllowedViewerText(currentText, email) {
  const e = (email || '').trim().toLowerCase()
  if (!e) return currentText || ''
  const existing = parseAllowedViewerEmailsFromText(currentText || '')
  if (existing.includes(e)) {
    return allowedViewerEmailsToFormText(existing)
  }
  return allowedViewerEmailsToFormText([...existing, e])
}

/** แปลง ProductOptions จาก DB */
export function parseProductOptionsFromDb(raw) {
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
    .map((o) => {
      const name = String(o?.name ?? '').trim()
      const required = Boolean(o?.required)
      const values = Array.isArray(o?.values)
        ? o.values
            .map((v) => ({
              label: String(v?.label ?? v ?? '').trim(),
              price: Math.max(0, Number(v?.price) || 0)
            }))
            .filter((v) => v.label)
        : []
      return { name, required, values }
    })
    .filter((o) => o.name && o.values.length > 0)
}

/** แปลง BundleLines จาก DB — allowZeroQty=true ใช้กับชุดแบบลูกค้ากำหนดสัดส่วน (เก็บรายการรหัสได้แม้ qty เป็น 0) */
export function parseBundleLinesFromDb(raw, allowZeroQty = false) {
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
    .map((l) => ({
      productId: String(l?.productId ?? l?.product_id ?? '').trim(),
      qty: Math.max(0, Number(l?.qty) || 0)
    }))
    .filter((l) => l.productId && (allowZeroQty ? true : l.qty > 0))
}

/** คีย์แยกรายการในตะกร้าเมื่อสินค้าเดียวกันแต่ตัวเลือกต่างกัน — bundleSelections ใช้กับชุดยืดหยุ่น (สัดส่วนละตัว) */
export function makeCartLineId(productId, selectedOptions, bundleSelections) {
  const id = String(productId || '').trim()
  const sel =
    selectedOptions && typeof selectedOptions === 'object' && !Array.isArray(selectedOptions)
      ? selectedOptions
      : {}
  const keys = Object.keys(sel).sort()
  let base = id
  if (keys.length > 0) {
    const part = keys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(sel[k] ?? ''))}`)
      .join('&')
    base = `${id}::${part}`
  }
  if (
    !bundleSelections ||
    typeof bundleSelections !== 'object' ||
    Array.isArray(bundleSelections)
  ) {
    return base
  }
  const pids = Object.keys(bundleSelections).sort()
  if (pids.length === 0) return base
  const bpart = pids
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(bundleSelections[k] ?? 0))}`)
    .join('&')
  return `${base}::b:${bpart}`
}

/** เปรียบเทียบตัวเลือกสินค้า (ลำดับคีย์ไม่สน) */
export function selectedOptionsEqual(a, b) {
  const x = a && typeof a === 'object' && !Array.isArray(a) ? a : {}
  const y = b && typeof b === 'object' && !Array.isArray(b) ? b : {}
  const ka = Object.keys(x).sort()
  const kb = Object.keys(y).sort()
  if (ka.length !== kb.length) return false
  return ka.every((k) => String(x[k] ?? '') === String(y[k] ?? ''))
}

/** ข้อความแสดงตัวเลือกที่เลือกแล้ว */
export function formatSelectedOptionsSummary(selectedOptions) {
  if (!selectedOptions || typeof selectedOptions !== 'object') return ''
  const keys = Object.keys(selectedOptions).sort()
  if (!keys.length) return ''
  return keys.map((k) => `${k}: ${selectedOptions[k]}`).join(', ')
}

/**
 * แสดงสินค้าบนหน้าแคตตาล็อกสำหรับ user นี้หรือไม่ (ไม่ใช้กับหน้าแอดมินสต็อก)
 * หมายเหตุ: การมองเห็นแยกจากราคา — ราคาใช้ normalizeProduct(..., userType) ตาม UserType ของบัญชี
 * (แฟรนไชส์ได้ FranchisePrice, ทั่วไปได้ Price) แม้สินค้าจะจำกัดเฉพาะอีเมล
 */
export function isProductVisibleOnStorefront(product, user) {
  if (!product) return false
  if (user?.role === 'admin') return true
  if (product.visibleOnHome === false) return false

  const email = (user?.email || '').trim().toLowerCase()
  if (!email) return false

  if (product.saleRestrictedToUsers === true) {
    const list = product.allowedViewerEmails || []
    return list.length > 0 && list.includes(email)
  }

  const ut = user?.userType || user?.customerType || 'regular'
  if (ut === 'franchise') {
    return product.saleToFranchise !== false
  }
  return product.saleToRegular !== false
}

export function filterProductsForStorefront(products, user) {
  return (products || []).filter((p) => isProductVisibleOnStorefront(p, user))
}

// Helper: Normalize product field names (Supabase uses PascalCase: ProductID, ProductName, etc.)
// Note: Column name in Supabase is now 'Unit' (English) after rename
// userType: 'franchise' or 'regular' - determines which price to use
export const normalizeProduct = (product, userType = 'regular') => {
  if (!product) return null
  
  // Handle unit column - Column name is now 'Unit' (English) in Supabase
  // Priority order:
  // 1. Unit (English - current column name after rename)
  // 2. หน่วย (Thai - fallback for old data)
  // 3. unit (lowercase - fallback)
  let unit = 'ชิ้น' // default
  
  // Check Unit first (current column name)
  if (product.Unit !== undefined && product.Unit !== null && product.Unit !== '') {
    unit = String(product.Unit).trim()
  } 
  // Fallback to Thai column name (for backward compatibility)
  else if (product['หน่วย'] !== undefined && product['หน่วย'] !== null && product['หน่วย'] !== '') {
    unit = String(product['หน่วย']).trim()
  } 
  // Fallback to lowercase
  else if (product.unit !== undefined && product.unit !== null && product.unit !== '') {
    unit = String(product.unit).trim()
  }
  
  // Ensure unit is not empty
  if (!unit || unit === '') {
    unit = 'ชิ้น'
  }
  
  // Get prices — ถ้าเป็นอ็อบเจ็กต์ที่ normalize แล้ว (เช่น แถวจากตะกร้า) ให้ใช้ regularPrice/franchisePrice เดิม ไม่ใช้ product.price เป็นฐาน
  const regularPrice =
    product.regularPrice !== undefined && product.regularPrice !== null && product.regularPrice !== ''
      ? Number(product.regularPrice)
      : (product.Price !== undefined && product.Price !== null && product.Price !== '')
        ? Number(product.Price)
        : product.price !== undefined && product.price !== null && product.price !== ''
          ? Number(product.price)
          : 0

  let franchisePrice = 0
  if (product.franchisePrice !== undefined && product.franchisePrice !== null && product.franchisePrice !== '') {
    const franchisePriceValue = Number(product.franchisePrice)
    if (!isNaN(franchisePriceValue)) franchisePrice = franchisePriceValue
  } else if (product.FranchisePrice !== undefined && product.FranchisePrice !== null && product.FranchisePrice !== '') {
    const franchisePriceValue = Number(product.FranchisePrice)
    if (!isNaN(franchisePriceValue)) franchisePrice = franchisePriceValue
  } else if (
    product.franchise_price !== undefined &&
    product.franchise_price !== null &&
    product.franchise_price !== ''
  ) {
    const franchisePriceValue = Number(product.franchise_price)
    if (!isNaN(franchisePriceValue)) franchisePrice = franchisePriceValue
  }
  
  // กำหนดราคาตาม userType ตามที่ระบุ:
  // UserType: franchise → ใช้ FranchisePrice
  // UserType: regular → ใช้ Price
  let price
  if (userType === 'franchise') {
    // ถ้าเป็น franchise ให้ใช้ FranchisePrice เสมอ
    price = franchisePrice > 0 ? franchisePrice : regularPrice // Fallback to regular price if franchise price is 0
  } else {
    // ถ้าเป็น regular ให้ใช้ Price เสมอ
    price = regularPrice
  }
  
  // Get Cost (ต้นทุน)
  const cost = (product.Cost !== undefined && product.Cost !== null && product.Cost !== '') 
    ? Number(product.Cost) 
    : (product.cost !== undefined && product.cost !== null && product.cost !== '') 
      ? Number(product.cost) 
      : 0

  const saleToFranchiseNorm =
    product.SaleToFranchise !== undefined && product.SaleToFranchise !== null
      ? Boolean(product.SaleToFranchise)
      : product.FranchiseAvailable !== undefined && product.FranchiseAvailable !== null
        ? Boolean(product.FranchiseAvailable)
        : product.franchise_available !== undefined && product.franchise_available !== null
          ? Boolean(product.franchise_available)
          : true

  return {
    ...product,
    id: product.ProductID || product.id || product.product_id || '',
    name: product.ProductName || product.name || product.product_name || '',
    image: product.Image || product.image || '',
    price: price, // Use price based on userType
    regularPrice: regularPrice, // Keep original regular price
    franchisePrice: franchisePrice, // Keep original franchise price
    cost: cost, // Cost (ต้นทุน)
    stock: product.Stock || product.stock || 0,
    category: product.Category || product.category || '',
    detail: product.Detail || product.detail || '',
    supplier: product.Supplier || product.supplier || '',
    unit: unit, // Use the normalized unit
    weight: product['Weight (grams)'] || product.Weight || product['น้ำหนัก (กรัม)'] || product.weight || 0,
    minStock: product.MinStock || product.Min || product.min_stock || product.minStock || 5,
    visibleOnHome:
      product.VisibleOnHome !== undefined && product.VisibleOnHome !== null
        ? Boolean(product.VisibleOnHome)
        : product.visible_on_home !== undefined && product.visible_on_home !== null
          ? Boolean(product.visible_on_home)
          : true,
    saleToFranchise: saleToFranchiseNorm,
    saleToRegular:
      product.SaleToRegular !== undefined && product.SaleToRegular !== null
        ? Boolean(product.SaleToRegular)
        : product.sale_to_regular !== undefined && product.sale_to_regular !== null
          ? Boolean(product.sale_to_regular)
          : true,
    saleRestrictedToUsers: Boolean(product.SaleRestrictedToUsers ?? product.sale_restricted_to_users),
    allowedViewerEmails: parseAllowedViewerEmailsFromDb(
      product.AllowedViewerEmails ?? product.allowed_viewer_emails
    ),
    franchiseAvailable: saleToFranchiseNorm,
    orderStep: Math.max(
      1,
      parseInt(
        product.orderStep !== undefined && product.orderStep !== null && product.orderStep !== ''
          ? product.orderStep
          : product.OrderStep || product.order_step || 1,
        10
      ) || 1
    ),
    isBundle: Boolean(product.IsBundle ?? product.is_bundle),
    bundleFlexible: Boolean(product.BundleFlexible ?? product.bundle_flexible),
    bundlePrimaryProductId: String(
      product.BundlePrimaryProductId ?? product.bundle_primary_product_id ?? ''
    ).trim(),
    bundleComponentSumEqualsPrimary: Boolean(
      product.BundleComponentSumEqualsPrimary ?? product.bundle_component_sum_equals_primary
    ),
    productOptions: parseProductOptionsFromDb(product.ProductOptions ?? product.product_options),
    bundleLines: parseBundleLinesFromDb(
      product.BundleLines ?? product.bundle_lines,
      Boolean(product.BundleFlexible ?? product.bundle_flexible)
    ),
    priceTiers: parsePriceTiers(product.priceTiers ?? product.PriceTiers)
  }
}

// Helper: Normalize products array
// userType: 'franchise' or 'regular' - determines which price to use
export const normalizeProducts = (products, userType = 'regular') => (products || []).map(p => normalizeProduct(p, userType))

// Parse Thai Date (DD/MM/YYYY)
export const parseThaiDate = (dateStr) => {
  if (!dateStr) return null
  try {
    const parts = dateStr.split(' ')[0].split('/')
    if (parts.length !== 3) return null
    let year = parseInt(parts[2], 10)
    if (year > 2400) year -= 543
    const date = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10))
    date.setHours(0, 0, 0, 0)
    return date
  } catch (e) {
    return null
  }
}

// Parse ISO Date (YYYY-MM-DD)
export const parseISODate = (dateStr) => {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr + 'T00:00:00')
    date.setHours(0, 0, 0, 0)
    return date
  } catch (e) {
    return null
  }
}

// Escape HTML and template literal special characters
export const escapeHtml = (str) => {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/`/g, '&#96;')
    .replace(/\$/g, '&#36;')
}

// Format date to YYYY-MM-DD
export const formatDateForInput = (date) => {
  if (!date) return ''
  if (date instanceof Date) {
    return date.toISOString().split('T')[0]
  }
  if (typeof date === 'string') {
    const parsed = parseISODate(date) || parseThaiDate(date)
    return parsed ? parsed.toISOString().split('T')[0] : ''
  }
  return ''
}
