/** จำนวนชิ้นที่ต้องจ่าย (ไม่รวมแถมจากโปรเดียวกัน) */
export function getPromotionPaidQty(cartItem, promotionId) {
  if (!cartItem?.qty || cartItem.qty <= 0) return 0
  let paidQty = cartItem.qty
  if (cartItem.isFree && cartItem.freeQty > 0) {
    if (cartItem.promotionId === promotionId) {
      paidQty = cartItem.qty - cartItem.freeQty
    }
  }
  return Math.max(0, paidQty)
}

function toNonNegativeInt(value) {
  const n = Math.floor(Number(value) || 0)
  return n > 0 ? n : 0
}

export const FREE_SHIPPING_PROMOTION_TYPE = 'free_shipping_min_purchase'

export function getCustomerPromotionType(user) {
  const raw = String(user?.userType || user?.customerType || 'regular').trim().toLowerCase()
  return raw === 'franchise' ? 'franchise' : 'regular'
}

export function normalizePromotionTargetCustomerType(value) {
  const raw = String(value || 'all').trim().toLowerCase()
  if (raw === 'regular' || raw === 'franchise') return raw
  return 'all'
}

export function isPromotionVisibleToCustomer(promotion, user) {
  const target = normalizePromotionTargetCustomerType(promotion?.TargetCustomerType)
  if (target === 'all') return true
  return target === getCustomerPromotionType(user)
}

export function getPromotionProductRemainingQty(promotion, { stockQty = null } = {}) {
  const limit = toNonNegativeInt(promotion?.PromotionProductLimit)
  const used = toNonNegativeInt(promotion?.PromotionProductUsed)
  if (limit > 0) return Math.max(0, limit - used)

  if (stockQty === null || stockQty === undefined || stockQty === '') {
    return Number.POSITIVE_INFINITY
  }
  return Math.max(0, Math.floor(Number(stockQty) || 0))
}

export function getPromotionEligiblePaidQty(promotion, cartItem, { stockQty = null } = {}) {
  const paidQty = getPromotionPaidQty(cartItem, promotion?.id)
  const remainingQty = getPromotionProductRemainingQty(promotion, { stockQty })
  return Math.max(0, Math.min(paidQty, remainingQty))
}

export function isPromotionWithinProductQuota(promotion, { stockQty = null } = {}) {
  return getPromotionProductRemainingQty(promotion, { stockQty }) > 0
}

export function isFreeShippingPromotion(promotion) {
  return promotion?.Type === FREE_SHIPPING_PROMOTION_TYPE
}

export function getFreeShippingMinPurchase(promotion) {
  return Math.max(0, Number(promotion?.MinPurchase) || 0)
}

export function isFreeShippingPromotionEligible(promotion, eligibleSubtotal) {
  if (!isFreeShippingPromotion(promotion)) return false
  return Math.max(0, Number(eligibleSubtotal) || 0) >= getFreeShippingMinPurchase(promotion)
}

/** แปลงค่า date input (YYYY-MM-DD) เป็นช่วงเวลาใช้โปร */
export function promotionDateInputToIsoRange(dateStr, kind) {
  const raw = String(dateStr || '').trim()
  if (!raw) return null
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return null
  if (kind === 'from') {
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
  }
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
}

/** ตรวจว่าโปรอยู่ในช่วงวันที่ (วันสิ้นสุดนับถึงสิ้นวัน) */
export function isPromotionWithinValidDates(promotion, now = new Date()) {
  const validFrom = promotion.ValidFrom ? new Date(promotion.ValidFrom) : null
  const validUntil = promotion.ValidUntil ? new Date(promotion.ValidUntil) : null
  if (validFrom && now < validFrom) return false
  if (validUntil && now > validUntil) return false
  return true
}

/** สรุปเงื่อนไขสำหรับแสดงในตารางแอดมิน */
export function formatPromotionCondition(promotion) {
  const type = promotion.Type || ''
  const lines = []
  if (type === 'buy_x_get_y') {
    const yId = promotion.GetProductID
    lines.push(`ซื้อ ${promotion.BuyQuantity || 0} แถม ${promotion.GetQuantity || 0}`)
    if (yId) lines.push(`สินค้า Y: ${yId}`)
  } else if (type === 'discount_percentage') {
    lines.push(`ส่วนลด ${promotion.DiscountPercentage || 0}% จากยอดสินค้า X`)
    if (Number(promotion.MaxDiscount) > 0) {
      lines.push(`สูงสุด ฿${Number(promotion.MaxDiscount).toLocaleString()}`)
    }
  } else if (type === 'discount_fixed') {
    lines.push(`ลด ฿${Number(promotion.DiscountAmount || 0).toLocaleString()} ต่อชิ้น (สินค้า X)`)
  } else if (type === 'target_unit_price') {
    lines.push(`ราคาพิเศษ ฿${Number(promotion.DiscountAmount || 0).toLocaleString()} / ชิ้น`)
  } else if (type === 'second_item_discount') {
    const pct = Number(promotion.DiscountPercentage) || 0
    if (pct > 0) {
      lines.push(`ชิ้นที่ 2,4,6… ลด ${pct}%`)
      if (Number(promotion.MaxDiscount) > 0) {
        lines.push(`สูงสุด ฿${Number(promotion.MaxDiscount).toLocaleString()}`)
      }
    } else {
      lines.push(`ชิ้นที่ 2,4,6… ลด ฿${Number(promotion.DiscountAmount || 0).toLocaleString()}/ชิ้น`)
    }
  } else if (type === FREE_SHIPPING_PROMOTION_TYPE) {
    lines.push('ซื้อครบยอดที่กำหนด รับฟรีค่าจัดส่ง')
  }
  if (Number(promotion.MinPurchase) > 0) {
    lines.push(`ยอดตะกร้าขั้นต่ำ ฿${Number(promotion.MinPurchase).toLocaleString()}`)
  }
  return lines
}

/** คำนวณส่วนลดเงินจากโปร (ไม่รวม buy_x_get_y) */
export function computePromotionMoneyDiscount(promotion, cartItem, { eligiblePaidQty = null } = {}) {
  const paidQty =
    eligiblePaidQty === null || eligiblePaidQty === undefined
      ? getPromotionPaidQty(cartItem, promotion.id)
      : Math.max(0, Math.floor(Number(eligiblePaidQty) || 0))
  if (paidQty <= 0) return 0
  const unitPrice = Number(cartItem.price || 0)
  const itemSubtotal = unitPrice * paidQty

  if (promotion.Type === 'discount_percentage') {
    const discountPercent = Number(promotion.DiscountPercentage) || 0
    if (discountPercent <= 0 || discountPercent > 100) return 0
    let amount = (itemSubtotal * discountPercent) / 100
    const maxDiscount = Number(promotion.MaxDiscount) || 0
    if (maxDiscount > 0 && amount > maxDiscount) amount = maxDiscount
    return Math.max(0, amount)
  }

  if (promotion.Type === 'discount_fixed') {
    const perUnit = Number(promotion.DiscountAmount) || 0
    if (perUnit <= 0) return 0
    return Math.min(itemSubtotal, perUnit * paidQty)
  }

  if (promotion.Type === 'target_unit_price') {
    const target = Number(promotion.DiscountAmount) || 0
    if (target < 0) return 0
    const perUnitOff = Math.max(0, unitPrice - target)
    return Math.min(itemSubtotal, perUnitOff * paidQty)
  }

  if (promotion.Type === 'second_item_discount') {
    return computeSecondItemPromotionDiscount(promotion, cartItem, { eligiblePaidQty: paidQty })
  }

  return 0
}

/** จำนวนชิ้นที่ได้ส่วนลด (ชิ้นที่ 2, 4, 6 … ของจำนวนที่จ่าย) */
export function getSecondItemDiscountUnits(paidQty) {
  const q = Math.max(0, Math.floor(Number(paidQty) || 0))
  if (q < 2) return 0
  return Math.floor(q / 2)
}

export function computeSecondItemPromotionDiscount(promotion, cartItem, { eligiblePaidQty = null } = {}) {
  const paidQty =
    eligiblePaidQty === null || eligiblePaidQty === undefined
      ? getPromotionPaidQty(cartItem, promotion.id)
      : Math.max(0, Math.floor(Number(eligiblePaidQty) || 0))
  const discountedUnits = getSecondItemDiscountUnits(paidQty)
  if (discountedUnits <= 0) return 0

  const unitPrice = Number(cartItem.price || 0)
  const discountPercent = Number(promotion.DiscountPercentage) || 0

  if (discountPercent > 0) {
    if (discountPercent > 100) return 0
    let amount = (unitPrice * discountedUnits * discountPercent) / 100
    const maxDiscount = Number(promotion.MaxDiscount) || 0
    if (maxDiscount > 0 && amount > maxDiscount) amount = maxDiscount
    return Math.max(0, amount)
  }

  const perUnit = Number(promotion.DiscountAmount) || 0
  if (perUnit <= 0) return 0
  return Math.min(unitPrice * discountedUnits, perUnit * discountedUnits)
}

export function getPromotionAppliedProductQty(promotion, cartItem, { eligiblePaidQty = null } = {}) {
  const paidQty =
    eligiblePaidQty === null || eligiblePaidQty === undefined
      ? getPromotionPaidQty(cartItem, promotion?.id)
      : Math.max(0, Math.floor(Number(eligiblePaidQty) || 0))
  if (paidQty <= 0) return 0

  if (promotion?.Type === 'buy_x_get_y') {
    const buyQuantity = toNonNegativeInt(promotion.BuyQuantity)
    if (buyQuantity <= 0) return 0
    return Math.floor(paidQty / buyQuantity) * buyQuantity
  }

  if (promotion?.Type === 'second_item_discount') {
    return getSecondItemDiscountUnits(paidQty) * 2
  }

  return paidQty
}

/** ดึงรหัสโปรจาก DiscountInfo (รูปแบบ `PromoIds: 1,2`) */
export function parsePromotionIdsFromDiscountInfo(discountInfo) {
  const raw = String(discountInfo || '')
  const match = raw.match(/PromoIds:\s*([\d,\s]+)/i)
  if (!match) return []
  return match[1]
    .split(',')
    .map((s) => parseInt(String(s).trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
}

/** นับจำนวนออเดอร์ (ไม่ซ้ำ OrderID) ที่ผู้ใช้ใช้โปร id นี้ */
export function countUserPromotionUses(orderRows, promotionId) {
  const pid = Number(promotionId)
  if (!pid) return 0
  const orderIds = new Set()
  for (const row of orderRows || []) {
    const ids = parsePromotionIdsFromDiscountInfo(row.DiscountInfo)
    if (ids.includes(pid) && row.OrderID) orderIds.add(row.OrderID)
  }
  return orderIds.size
}

/** ตรวจว่าโปรยังใช้ได้ตามจำกัดต่อคนและรวม */
export function isPromotionWithinUsageLimits(promotion, { userOrderRows = [] } = {}) {
  const totalLimit = Number(promotion.TotalUsageLimit) || 0
  const usageCount = Number(promotion.UsageCount) || 0
  if (totalLimit > 0 && usageCount >= totalLimit) return false

  const perUserLimit = Number(promotion.UsageLimit) || 0
  if (perUserLimit > 0 && userOrderRows.length > 0) {
    const usedByUser = countUserPromotionUses(userOrderRows, promotion.id)
    if (usedByUser >= perUserLimit) return false
  }

  return true
}

export const PROMOTION_TYPE_LABELS = {
  buy_x_get_y: 'ซื้อ X แถม Y',
  discount_percentage: 'ส่วนลดเปอร์เซ็นต์',
  discount_fixed: 'ส่วนลดต่อชิ้น',
  target_unit_price: 'ราคาพิเศษต่อชิ้น',
  second_item_discount: 'ชิ้นที่ 2 ลด (บาท/%)',
  free_shipping_min_purchase: 'ซื้อครบยอด ส่งฟรี'
}

export const PROMOTION_TARGET_CUSTOMER_TYPE_LABELS = {
  all: 'ทั้งหมด',
  regular: 'ลูกค้าปกติ',
  franchise: 'แฟรนไชส์'
}
