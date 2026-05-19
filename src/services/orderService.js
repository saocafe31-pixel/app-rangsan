/**
 * orderService – บริการดึง/อัปเดตออเดอร์
 * ตาราง order เก็บทีละแถวต่อรายการ (หนึ่งออเดอร์มีหลายแถว) จึงต้อง group ตาม OrderID ก่อนส่งกลับ
 * ดึง ProductID จากตาราง products แมตช์กับชื่อสินค้า เพื่อให้แสกน QR (ที่ encode ProductID) ใช้ได้ในหน้าแพ็ก
 */
import { supabase } from '../utils/supabase'
import { productService } from './productService'
import {
  buildOrderLineItemName,
  computeBundleStockMoves,
  orderItemNameFirstLine,
  parseBundleSelectionIdsFromItemName
} from '../utils/orderBundleLineUtils'

async function deductStockForPlacedOrderItem(item, userEmail, orderId) {
  const moves =
    item.bundleStockMoves && typeof item.bundleStockMoves === 'object' && !Array.isArray(item.bundleStockMoves)
      ? item.bundleStockMoves
      : null
  if (moves && Object.keys(moves).length > 0) {
    for (const [pid, raw] of Object.entries(moves)) {
      const take = Math.round(Number(raw)) || 0
      if (take <= 0) continue
      const comp = await productService.getProduct(pid)
      if (!comp) continue
      const newStock = Math.max(0, (comp.stock || 0) - take)
      await productService.updateStock(
        pid,
        newStock,
        userEmail,
        'OUT',
        `ขาย/ชุดสินค้า - ออเดอร์: ${orderId}`
      )
    }
    return
  }

  const product = await productService.getProduct(item.id)
  if (!product) return

  const qty = Math.round(Number(item.qty)) || 0
  if (qty <= 0) return

  const newStock = Math.max(0, (product.stock || 0) - qty)
  await productService.updateStock(item.id, newStock, userEmail, 'OUT', `ขาย/สั่งซื้อ - ออเดอร์: ${orderId}`)
}

/** คืนสต็อกหนึ่งแถวออเดอร์ (อ่าน BUNDLE_IDS จากชื่อแถว หรือคืนที่ parent) */
export async function restoreStockForCancelledOrderItem(item, userEmail, orderId) {
  const fromName = parseBundleSelectionIdsFromItemName(item.name || '')
  if (fromName.size > 0) {
    for (const [pid, rawQty] of fromName.entries()) {
      const add = Math.round(Number(rawQty)) || 0
      if (add <= 0) continue
      const comp = await productService.getProduct(pid)
      if (!comp) continue
      const newStock = (comp.stock || 0) + add
      await productService.updateStock(
        pid,
        newStock,
        userEmail,
        'IN',
        `คืนสินค้าจากการยกเลิกออเดอร์ ${orderId}`
      )
    }
    return
  }
  const pid = String(item.id || item.productId || '').trim()
  const qty = Math.round(Number(item.qty)) || 0
  if (!pid || qty <= 0) return
  const comp = await productService.getProduct(pid)
  if (!comp) return
  const newStock = (comp.stock || 0) + qty
  await productService.updateStock(pid, newStock, userEmail, 'IN', `คืนสินค้าจากการยกเลิกออเดอร์ ${orderId}`)
}

/** สร้าง Map ชื่อสินค้า (trim) -> ProductID จากตาราง products */
async function buildProductNameToIdMap() {
  const { data: products, error } = await supabase
    .from('products')
    .select('ProductID, ProductName')
  if (error) {
    console.warn('[orderService] ไม่สามารถดึง products สำหรับแมป ProductID:', error.message)
    return new Map()
  }
  const map = new Map()
  ;(products || []).forEach((p) => {
    const id = p.ProductID ?? p.productid
    const name = (p.ProductName ?? p.productname ?? '').toString().trim()
    if (name && id) map.set(name, id)
  })
  return map
}

/** ปรับ orderId ให้เป็น string เดียวกันเวลาใช้เป็น key (ป้องกันแยกกลุ่มถ้า DB ส่ง casing ต่างกัน) */
function normalizeOrderId(value) {
  if (value == null) return ''
  return String(value).trim()
}

/** จัดกลุ่มแถวตาราง order (หลายแถวต่อออเดอร์) เป็นออเดอร์เดียว — รูปแบบเดียวกับ getAllOrders (แอดมิน) */
async function buildAdminOrdersFromRawRows(rawRows) {
  const ordersMap = new Map()
  const rawOrders = rawRows || []

  rawOrders.forEach((row) => {
    const rawId = row.OrderID ?? row.orderid ?? row.order_id
    const orderId = normalizeOrderId(rawId)
    if (!orderId) return

    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        ID: orderId,
        OrderID: orderId,
        UserEmail: row.UserEmail || row.useremail,
        Username: row.Username || row.username,
        Total: row.Total || row.total || 0,
        Status: row.Status || row.status || 'รอตรวจสอบ',
        SlipURL: row.SlipURL || row.slipurl,
        Address: row.Address || row.address,
        TrackingNo: row.TrackingNo || row.trackingno || row.Tracking || row.tracking,
        Timestamp: row.Timestamp || row.timestamp || row.CreatedAt || row.created_at,
        Discount: row.Discount || row.discount || 0,
        DiscountInfo: row.DiscountInfo || row.discountinfo || row.Discount || row.discount || '',
        PromotionDiscount: row.PromotionDiscount || row.promotionDiscount || row.Promotion || row.promotion || 0,
        'Shipping Cost':
          row['Shipping Cost'] || row.ShippingCost || row.Shipping || row.shippingCost || row.shipping || 0,
        ShippingCost: row['Shipping Cost'] || row.ShippingCost || row.Shipping || row.shippingCost || row.shipping || 0,
        Weight: row.Weight || row.weight || 0,
        PaymentMethod: row.PaymentMethod || row.paymentmethod || 'transfer',
        ShippingMethod: row.ShippingMethod || row.shippingmethod || 'delivery',
        Subdistrict: row.Subdistrict || row.subdistrict || null,
        District: row.District || row.district || null,
        Province: row.Province || row.province || null,
        PostalCode: row.PostalCode || row.postalcode || null,
        RecipientPhone: row.RecipientPhone || row.recipientphone || null,
        Items: []
      })
    }

    const order = ordersMap.get(orderId)
    order.Items.push({
      id: row.ProductID || row.productid || null,
      name: row.Itemname || row.ItemName || row.itemname || row.item_name,
      qty: row.Qty || row.qty || 0,
      price: row.Price || row.price || 0
    })
  })

  const ordersData = Array.from(ordersMap.values()).sort((a, b) => {
    const dateA = new Date(a.Timestamp || 0)
    const dateB = new Date(b.Timestamp || 0)
    return dateB - dateA
  })

  await enrichOrderItemsWithProductId(ordersData)
  return ordersData
}

/** ตัวกรองเดียวกับหน้า AdminOrders (ใช้ fallback เมื่อยังไม่มี RPC แบ่งหน้า) */
function orderMatchesAdminListFilters(order, filters) {
  const statusFilter = filters.statusFilter ?? 'All'
  const searchOrderId = filters.searchOrderId ?? ''
  const showAllDates = filters.showAllDates === true
  const startDate = filters.startDate ?? ''
  const endDate = filters.endDate ?? ''

  if (statusFilter !== 'All' && (order.Status || order.status) !== statusFilter) {
    return false
  }

  if (searchOrderId.trim()) {
    const searchTerm = searchOrderId.trim().toLowerCase()
    const orderId = (order.ID || order.OrderID || '').toString().toLowerCase()
    const username = (order.Username || order.username || '').toString().toLowerCase()
    const userEmail = (order.UserEmail || order.useremail || order.User || '').toString().toLowerCase()
    if (!orderId.includes(searchTerm) && !username.includes(searchTerm) && !userEmail.includes(searchTerm)) {
      return false
    }
  }

  if (!showAllDates && (startDate || endDate)) {
    const orderDate = order.Timestamp || order.CreatedAt || order.createdat
    if (orderDate) {
      const orderDateObj = new Date(orderDate)
      if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        if (orderDateObj < start) {
          return false
        }
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (orderDateObj > end) {
          return false
        }
      }
    } else {
      return false
    }
  }

  return true
}

/** ใส่ item.id (ProductID) ให้แต่ละรายการใน order.Items โดยแมปจากชื่อสินค้าในตาราง products */
async function enrichOrderItemsWithProductId(orders) {
  if (!orders || !Array.isArray(orders) || orders.length === 0) return orders
  const nameToId = await buildProductNameToIdMap()
  if (nameToId.size === 0) return orders
  orders.forEach((order) => {
    if (!order.Items || !Array.isArray(order.Items)) return
    order.Items.forEach((item) => {
      if (item.id) return // มี ProductID จากตาราง order อยู่แล้ว
      const rawName = (item.name ?? '').toString().trim()
      const firstLine = orderItemNameFirstLine(rawName).trim()
      const productId = nameToId.get(rawName) || nameToId.get(firstLine) || null
      if (productId) item.id = productId
    })
  })
  return orders
}

export const orderService = {
  /** ดึงออเดอร์ของ user ตามอีเมล (รองรับชื่อคอลัมน์หลายแบบ: UserEmail / useremail / User) */
  async getUserOrders(userEmail) {
    // ลองหลายรูปแบบชื่อคอลัมน์เพราะบางโปรเจกต์ใช้ตัวเล็ก/ตัวใหญ่ต่างกัน
    let { data, error } = await supabase
      .from('order')
      .select('*')
      .eq('UserEmail', userEmail)
      .order('Timestamp', { ascending: false })

    // If not found, try lowercase
    if (error || !data || data.length === 0) {
      const result = await supabase
        .from('order')
        .select('*')
        .eq('useremail', userEmail)
        .order('timestamp', { ascending: false })
      data = result.data
      error = result.error
    }

    // If still not found, try 'User' (fallback)
    if (error || !data || data.length === 0) {
      const result = await supabase
        .from('order')
        .select('*')
        .eq('User', userEmail)
        .order('CreatedAt', { ascending: false })
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('Error fetching user orders:', error)
      throw new Error(error.message || 'ไม่สามารถดึงข้อมูลออเดอร์ได้')
    }

    // Group orders by OrderID (since each item is a separate row)
    const ordersMap = new Map()
    const rawOrders = data || []
    
    rawOrders.forEach(row => {
      const rawId = row.OrderID ?? row.orderid ?? row.order_id
      const orderId = normalizeOrderId(rawId)
      if (!orderId) return

      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          ID: orderId,
          OrderID: orderId,
          UserEmail: row.UserEmail || row.useremail || row.User,
          User: row.UserEmail || row.useremail || row.User,
          Username: row.Username || row.username,
          Total: row.Total || row.total || 0,
          Status: row.Status || row.status || 'รอตรวจสอบ',
          SlipURL: row.SlipURL || row.slipurl,
          Address: row.Address || row.address,
          Subdistrict: row.Subdistrict || row.subdistrict || null,
          District: row.District || row.district || null,
          Province: row.Province || row.province || null,
          PostalCode: row.PostalCode || row.postalcode || null,
          RecipientPhone: row.RecipientPhone || row.recipientphone || null,
          TrackingNo: row.TrackingNo || row.trackingno || row.Tracking || row.tracking,
          Timestamp: row.Timestamp || row.timestamp || row.CreatedAt || row.created_at,
          CreatedAt: row.Timestamp || row.timestamp || row.CreatedAt || row.created_at,
          DiscountInfo: row.DiscountInfo || row.discountinfo || row.Discount || row.discount || '',
          Discount: row.Discount || row.discount || 0,
          ShippingCost: row.ShippingCost || row.Shipping || row.shippingcost || row.shipping || 0,
          TotalWeight: row.TotalWeight || row.Weight || row.totalweight || row.weight || 0,
          PaymentMethod: row.PaymentMethod || row.paymentmethod,
          ShippingMethod: row.ShippingMethod || row.shippingmethod,
          Items: []
        })
      }

      // Add item to order
      const itemName = row.ItemName || row.itemname || row.Itemname
      const itemQty = row.Qty || row.qty || 0
      const itemPrice = row.Price || row.price || 0
      
      if (itemName) {
        ordersMap.get(orderId).Items.push({
          name: itemName,
          qty: itemQty,
          price: itemPrice
        })
      }
    })

    const orders = Array.from(ordersMap.values())
    await enrichOrderItemsWithProductId(orders)
    return orders
  },

  // Get all orders (admin)
  async getAllOrders() {
    const { data, error } = await supabase
      .from('order')
      .select('*')
      .order('Timestamp', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return buildAdminOrdersFromRawRows(data || [])
  },

  /**
   * แบ่งหน้าออเดอร์แอดมิน (ค่าเริ่ม 20 ออเดอร์/หน้า)
   * ใช้ RPC get_admin_orders_page_ids — ถ้ายังไม่รัน migration จะ fallback เป็น getAllOrders + slice
   */
  async getOrdersPage(options = {}) {
    const page = Math.max(1, Number(options.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20))
    const statusFilter = options.statusFilter ?? 'All'
    const searchOrderId = options.searchOrderId ?? ''
    const showAllDates = options.showAllDates === true
    const startDate = options.startDate ?? ''
    const endDate = options.endDate ?? ''

    const filters = { statusFilter, searchOrderId, showAllDates, startDate, endDate }
    const searchTerm = searchOrderId.trim()
    const shouldUseFallbackSearch = searchTerm.length > 0

    let pDateStart = null
    let pDateEnd = null
    if (!showAllDates && (startDate || endDate)) {
      pDateStart = startDate && String(startDate).trim() ? String(startDate).trim() : null
      pDateEnd = endDate && String(endDate).trim() ? String(endDate).trim() : null
    }

    if (!shouldUseFallbackSearch) {
      const rpcArgs = {
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
        p_status: statusFilter === 'All' ? null : statusFilter,
        p_order_id_search: searchTerm ? searchTerm : null,
        p_date_start: pDateStart,
        p_date_end: pDateEnd
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_orders_page_ids', rpcArgs)

      if (!rpcError && rpcData && Array.isArray(rpcData.order_ids)) {
        const orderIds = rpcData.order_ids.map((id) => String(id || '').trim()).filter(Boolean)
        const totalOrders = Number(rpcData.total) || 0
        if (orderIds.length === 0) {
          return { orders: [], totalOrders }
        }

        let rows = null
        let rowError = null
        const q1 = await supabase.from('order').select('*').in('OrderID', orderIds)
        if (!q1.error && q1.data) {
          rows = q1.data
        } else {
          const q2 = await supabase.from('order').select('*').in('orderid', orderIds)
          rows = q2.data
          rowError = q2.error
        }
        if (rowError) {
          throw new Error(rowError.message || 'ไม่สามารถดึงรายละเอียดออเดอร์ได้')
        }

        const grouped = await buildAdminOrdersFromRawRows(rows || [])
        const byId = new Map(grouped.map((o) => [o.ID || o.OrderID, o]))
        const orders = orderIds.map((id) => byId.get(id)).filter(Boolean)
        return { orders, totalOrders }
      }

      if (import.meta.env.DEV && rpcError) {
        console.warn('[orderService] get_admin_orders_page_ids ไม่พร้อม — fallback โหลดทั้งหมด:', rpcError.message)
      }
    }

    const all = await this.getAllOrders()
    const filtered = all.filter((o) => orderMatchesAdminListFilters(o, filters))
    const totalOrders = filtered.length
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize)
    return { orders: slice, totalOrders }
  },

  /** นับออเดอร์ตามสถานะ (ตัวกรองค้นหา/วันเดียวกับหน้าแบ่งหน้า) */
  async getAdminOrderStatusCounts(options = {}) {
    const searchOrderId = options.searchOrderId ?? ''
    const showAllDates = options.showAllDates === true
    const startDate = options.startDate ?? ''
    const endDate = options.endDate ?? ''

    let pDateStart = null
    let pDateEnd = null
    if (!showAllDates && (startDate || endDate)) {
      pDateStart = startDate && String(startDate).trim() ? String(startDate).trim() : null
      pDateEnd = endDate && String(endDate).trim() ? String(endDate).trim() : null
    }

    const searchTerm = searchOrderId.trim()
    const shouldUseFallbackSearch = searchTerm.length > 0

    if (!shouldUseFallbackSearch) {
      const { data, error } = await supabase.rpc('get_admin_order_status_counts', {
        p_order_id_search: searchTerm ? searchTerm : null,
        p_date_start: pDateStart,
        p_date_end: pDateEnd
      })

      if (!error && data && typeof data.All === 'number') {
        return {
          All: data.All,
          รอตรวจสอบ: data['รอตรวจสอบ'] ?? 0,
          กำลังจัดเตรียม: data['กำลังจัดเตรียม'] ?? 0,
          จัดส่งแล้ว: data['จัดส่งแล้ว'] ?? 0,
          ยกเลิก: data['ยกเลิก'] ?? 0
        }
      }

      if (import.meta.env.DEV && error) {
        console.warn('[orderService] get_admin_order_status_counts ไม่พร้อม — fallback:', error.message)
      }
    }

    const all = await this.getAllOrders()
    const baseFilters = { statusFilter: 'All', searchOrderId, showAllDates, startDate, endDate }
    const base = all.filter((o) => orderMatchesAdminListFilters(o, baseFilters))
    const st = (o) => o.Status || o.status
    return {
      All: base.length,
      รอตรวจสอบ: base.filter((o) => st(o) === 'รอตรวจสอบ').length,
      กำลังจัดเตรียม: base.filter((o) => st(o) === 'กำลังจัดเตรียม').length,
      จัดส่งแล้ว: base.filter((o) => st(o) === 'จัดส่งแล้ว').length,
      ยกเลิก: base.filter((o) => st(o) === 'ยกเลิก').length
    }
  },

  // Place order
  // Note: Order table structure is like Google Sheets - one row per item
  // Columns: OrderID, UserEmail, Username, ItemName, Qty, Price, Total, Status, SlipURL, Address, TrackingNo, Timestamp, Discount, Shipping, TotalWeight
  async placeOrder(orderData, options = {}) {
    const skipCouponUsage = options.skipCouponUsage === true
    const skipPromotionUsage = options.skipPromotionUsage === true
    const skipStockUpdate = options.skipStockUpdate === true

    // Build discount info string
    // Format for coupon: "Code: {code} (-{amount}B)"
    // Format for promotion: "Promotion: {amount}B" (if no coupon code)
    // Also include free items info: "FreeItems: {itemName}:{freeQty},..."
    let discountInfo = null
    const freeItemsInfo = []
    
    // Collect free items information
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach(item => {
        if (item.freeQty && item.freeQty > 0) {
          freeItemsInfo.push(`${item.name}:${item.freeQty}`)
        }
      })
    }
    
    const promoIdList =
      orderData.promotions && Array.isArray(orderData.promotions)
        ? [...new Set(orderData.promotions.map((p) => p.id).filter(Boolean))]
        : []
    const promoIdsSuffix =
      promoIdList.length > 0 ? ` | PromoIds: ${promoIdList.join(',')}` : ''

    if (orderData.discountCode && orderData.discountAmount) {
      discountInfo = `Code: ${orderData.discountCode} (-${orderData.discountAmount}B)`
      if (freeItemsInfo.length > 0) {
        discountInfo += ` | FreeItems: ${freeItemsInfo.join(',')}`
      }
      if (promoIdsSuffix) discountInfo += promoIdsSuffix
    } else if (orderData.promotionDiscount && orderData.promotionDiscount > 0) {
      discountInfo = `Promotion: -${orderData.promotionDiscount}B`
      if (freeItemsInfo.length > 0) {
        discountInfo += ` | FreeItems: ${freeItemsInfo.join(',')}`
      }
      if (promoIdsSuffix) discountInfo += promoIdsSuffix
    } else if (orderData.discountAmount && Number(orderData.discountAmount) > 0) {
      discountInfo = `ส่วนลดแบ่งส่วน: -${orderData.discountAmount}B`
      if (freeItemsInfo.length > 0) {
        discountInfo += ` | FreeItems: ${freeItemsInfo.join(',')}`
      }
      if (promoIdsSuffix) discountInfo += promoIdsSuffix
    } else if (freeItemsInfo.length > 0) {
      discountInfo = `FreeItems: ${freeItemsInfo.join(',')}`
      if (promoIdsSuffix) discountInfo += promoIdsSuffix
    } else if (promoIdsSuffix) {
      discountInfo = promoIdsSuffix.replace(/^\s*\|\s*/, '')
    }

    const tagParts = []
    if (orderData.supplierTag) {
      tagParts.push(`Supplier: ${String(orderData.supplierTag).trim()}`)
    }
    if (orderData.checkoutBatchId) {
      tagParts.push(`Batch: ${String(orderData.checkoutBatchId).trim()}`)
    }
    if (orderData.createdByAdmin) {
      tagParts.push('แหล่งที่มา: สร้างโดยแอดมินหลังบ้าน')
    }
    if (orderData.adminDiscountNote && String(orderData.adminDiscountNote).trim()) {
      const note = String(orderData.adminDiscountNote).trim().replace(/\|/g, ' ')
      tagParts.push(`หมายเหตุแอดมิน: ${note}`)
    }
    if (tagParts.length > 0) {
      discountInfo = discountInfo ? `${discountInfo} | ${tagParts.join(' | ')}` : tagParts.join(' | ')
    }

    // Get username from user email (optional, can use email if not found)
    let username = orderData.user
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('Username')
        .eq('Email', orderData.user)
        .maybeSingle()
      
      if (userData?.Username) {
        username = userData.Username
      }
    } catch (e) {
      console.warn('Could not fetch username, using email:', e)
    }

    const itemsForInsert = orderData.items || []
    for (const item of itemsForInsert) {
      try {
        const product = await productService.getProduct(item.id)
        item.bundleStockMoves = computeBundleStockMoves(item, product || { id: item.id })
      } catch {
        item.bundleStockMoves = computeBundleStockMoves(item, { id: item.id })
      }
    }

    // Insert each item as a separate row (like Google Sheets structure)
    // Column names must match Supabase exactly. Price/Total/Discount/Weight รองรับทศนิยม (numeric) แล้ว
    const orderRows = itemsForInsert.map((item) => {
      const qty = Math.round(Number(item.qty)) || 0
      const price = Number(item.price) ?? 0
      const total = Number(orderData.total) ?? 0
      const discount = (Number(orderData.discountAmount) || 0) + (Number(orderData.promotionDiscount) || 0)
      const shippingCost = Number(orderData.shippingCost) || 0
      const weight = Number(orderData.totalWeight) || 0
      return {
        OrderID: orderData.id,
        UserEmail: orderData.user,
        Username: username,
        ProductID: item.id || null,
        Itemname: buildOrderLineItemName(item, item.bundleStockMoves || {}),
        Qty: qty,
        Price: price,
        Total: total,
        Status: orderData.status || 'รอตรวจสอบ',
        SlipURL: orderData.slipURL || null,
        Address: orderData.address,
        Subdistrict: orderData.subdistrict || null,
        District: orderData.district || null,
        Province: orderData.province || null,
        PostalCode: orderData.postalCode || null,
        RecipientPhone: orderData.recipientPhone || null,
        TrackingNo: orderData.tracking || null,
        Timestamp: new Date().toISOString(),
        Discount: discount,
        DiscountInfo: discountInfo || null,
        'Shipping Cost': shippingCost,
        Weight: weight,
        ShippingMethod: orderData.shippingMethod || 'delivery',
        PaymentMethod: orderData.paymentMethod || 'transfer'
      }
    })

    // Insert with exact column names from Supabase
    try {
      const { data, error } = await supabase
        .from('order')
        .insert(orderRows)
        .select()

      if (error) {
        console.error('Order insert error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw new Error(error.message || 'Could not insert order')
      }

      if (data && data.length > 0) {
        if (!skipStockUpdate) {
          try {
            for (const item of itemsForInsert) {
              await deductStockForPlacedOrderItem(item, orderData.user, orderData.id)
            }
          } catch (stockError) {
            console.error('Error updating stock:', stockError)
          }
        }

        // Update coupon usage count if discount code was used
        if (orderData.discountCode && !skipCouponUsage) {
          try {
            // First, get current usage count
            const { data: couponData, error: fetchError } = await supabase
              .from('coupons')
              .select('UsageCount')
              .eq('Code', orderData.discountCode.toUpperCase())
              .maybeSingle()
            
            if (!fetchError && couponData) {
              const newUsageCount = (couponData.UsageCount || 0) + 1
              const { error: updateError } = await supabase
                .from('coupons')
                .update({ UsageCount: newUsageCount })
                .eq('Code', orderData.discountCode.toUpperCase())
              
              if (updateError) {
                console.error('Error updating coupon usage count:', updateError)
                // Don't throw error - order is already placed
              } else {
                console.log(`Coupon usage count updated for code: ${orderData.discountCode} (${newUsageCount})`)
              }
            } else if (fetchError) {
              console.error('Error fetching coupon for usage count update:', fetchError)
            }
          } catch (couponUpdateError) {
            console.error('Error updating coupon usage count:', couponUpdateError)
            // Don't throw error - order is already placed
          }
        }

        // Update promotion usage count if promotions were used
        if (
          !skipPromotionUsage &&
          orderData.promotions &&
          Array.isArray(orderData.promotions) &&
          orderData.promotions.length > 0
        ) {
          try {
            for (const promotion of orderData.promotions) {
              if (promotion.id) {
                // Get current usage count
                const { data: promotionData, error: fetchError } = await supabase
                  .from('promotions')
                  .select('UsageCount')
                  .eq('id', promotion.id)
                  .maybeSingle()
                
                if (!fetchError && promotionData) {
                  const newUsageCount = (promotionData.UsageCount || 0) + 1
                  const { error: updateError } = await supabase
                    .from('promotions')
                    .update({ UsageCount: newUsageCount })
                    .eq('id', promotion.id)
                  
                  if (updateError) {
                    console.error(`Error updating promotion usage count for ID ${promotion.id}:`, updateError)
                    // Don't throw error - order is already placed
                  } else {
                    console.log(`Promotion usage count updated for ID: ${promotion.id} (${newUsageCount})`)
                  }
                } else if (fetchError) {
                  console.error(`Error fetching promotion for usage count update (ID: ${promotion.id}):`, fetchError)
                }
              }
            }
          } catch (promotionUpdateError) {
            console.error('Error updating promotion usage count:', promotionUpdateError)
            // Don't throw error - order is already placed
          }
        }

        // Return first inserted row as representative (for compatibility with existing code)
        return data[0]
      }

      throw new Error('Order inserted but no data returned')
    } catch (error) {
      throw new Error(error.message || 'Could not insert order')
    }
  },

  // Update order status
  // Note: Order table has multiple rows per order (one per item), so we update all rows with matching OrderID
  async updateOrderStatus(orderId, status, tracking = null) {
    const updateData = { Status: status }
    if (tracking) {
      updateData.TrackingNo = tracking // Use TrackingNo column name from Supabase
    }

    // Try different column name variations for OrderID
    let data = null
    let error = null

    // Try OrderID first (as per Supabase schema)
    const result1 = await supabase
      .from('order')
      .update(updateData)
      .eq('OrderID', orderId)
      .select()

    if (result1.error) {
      // Try ID as fallback
      const result2 = await supabase
        .from('order')
        .update(updateData)
        .eq('ID', orderId)
        .select()
      
      if (result2.error) {
        error = result2.error
      } else {
        data = result2.data
      }
    } else {
      data = result1.data
    }

    if (error) {
      throw new Error(error.message)
    }

    return data
  },

  // Edit order - update items, prices, quantities, and shipping
  // This deletes old order rows and creates new ones with updated data
  async editOrder(orderId, newItems, newShipping = null, userEmail) {
    try {
      // Get current order data (ลอง OrderID ก่อน แล้วลอง orderid ถ้าไม่มีแถว)
      let currentOrderRows = null
      let fetchError = null
      const res1 = await supabase.from('order').select('*').eq('OrderID', orderId)
      fetchError = res1.error
      currentOrderRows = res1.data
      if ((fetchError || !currentOrderRows || currentOrderRows.length === 0)) {
        const res2 = await supabase.from('order').select('*').eq('orderid', orderId)
        if (!res2.error && res2.data && res2.data.length > 0) {
          fetchError = null
          currentOrderRows = res2.data
        }
      }

      if (fetchError) {
        // Try ID as fallback
        const { data: altRows, error: altError } = await supabase
          .from('order')
          .select('*')
          .eq('ID', orderId)

        if (altError) {
          throw new Error(altError.message)
        }

        if (!altRows || altRows.length === 0) {
          throw new Error('Order not found')
        }

        // Get metadata from first row
        const firstRow = altRows[0]
        const oldTotal = altRows.reduce((sum, row) => {
          const qty = row.Qty || row.qty || 0
          const price = row.Price || row.price || 0
          return sum + (qty * price)
        }, 0)

        // Calculate new total
        const newTotal = newItems.reduce((sum, item) => sum + (item.price * item.qty), 0) + (newShipping || firstRow['Shipping Cost'] || firstRow.Shipping || 0)

        // Delete old order rows
        const deleteResult = await supabase
          .from('order')
          .delete()
          .eq('ID', orderId)

        if (deleteResult.error) {
          throw new Error(deleteResult.error.message)
        }

        // Create new order rows (ค่า Price/Total ฯลฯ เป็นตัวเลข รองรับทศนิยม)
        const orderRows = newItems.map(item => ({
          OrderID: orderId,
          UserEmail: firstRow.UserEmail || firstRow.useremail,
          Username: firstRow.Username || firstRow.username,
          Itemname: item.name,
          Qty: Math.round(Number(item.qty)) || 0,
          Price: Number(item.price) ?? 0,
          Total: Number(newTotal) ?? 0,
          Status: firstRow.Status || firstRow.status || 'รอตรวจสอบ',
          SlipURL: firstRow.SlipURL || firstRow.slipurl,
          Address: firstRow.Address || firstRow.address,
          TrackingNo: firstRow.TrackingNo || firstRow.trackingno,
          Timestamp: firstRow.Timestamp || firstRow.timestamp || new Date().toISOString(),
          Discount: Number(firstRow.Discount ?? firstRow.discount ?? 0) || 0,
          'Shipping Cost': newShipping !== null ? Number(newShipping) : (Number(firstRow['Shipping Cost'] ?? firstRow.Shipping ?? 0) || 0),
          Weight: Number(firstRow.Weight ?? firstRow.weight ?? 0) || 0
        }))

        const { data: insertedData, error: insertError } = await supabase
          .from('order')
          .insert(orderRows)
          .select()

        if (insertError) {
          throw new Error(insertError.message)
        }

        return {
          success: true,
          oldTotal: oldTotal,
          newTotal: newTotal,
          diff: newTotal - oldTotal,
          data: insertedData
        }
      }

      if (!currentOrderRows || currentOrderRows.length === 0) {
        throw new Error('Order not found')
      }

      // Get metadata from first row
      const firstRow = currentOrderRows[0]
      const oldTotal = currentOrderRows.reduce((sum, row) => {
        const qty = row.Qty || row.qty || 0
        const price = row.Price || row.price || 0
        return sum + (qty * price)
      }, 0)

      // Calculate new total
      const newTotal = newItems.reduce((sum, item) => sum + (item.price * item.qty), 0) + (newShipping !== null ? newShipping : (firstRow['Shipping Cost'] || firstRow.Shipping || 0))

      // Delete old order rows (ลอง OrderID ก่อน แล้วลอง orderid)
      let deleteResult = await supabase.from('order').delete().eq('OrderID', orderId)
      if (deleteResult.error) {
        deleteResult = await supabase.from('order').delete().eq('orderid', orderId)
      }
      if (deleteResult.error) {
        throw new Error(deleteResult.error.message)
      }

      // Create new order rows (ค่า Price/Total ฯลฯ เป็นตัวเลข รองรับทศนิยม)
      const orderRows = newItems.map(item => ({
        OrderID: orderId,
        UserEmail: firstRow.UserEmail || firstRow.useremail,
        Username: firstRow.Username || firstRow.username,
        Itemname: item.name,
        Qty: Math.round(Number(item.qty)) || 0,
        Price: Number(item.price) ?? 0,
        Total: Number(newTotal) ?? 0,
        Status: firstRow.Status || firstRow.status || 'รอตรวจสอบ',
        SlipURL: firstRow.SlipURL || firstRow.slipurl,
        Address: firstRow.Address || firstRow.address,
        TrackingNo: firstRow.TrackingNo || firstRow.trackingno,
        Timestamp: firstRow.Timestamp || firstRow.timestamp || new Date().toISOString(),
        Discount: Number(firstRow.Discount ?? firstRow.discount ?? 0) || 0,
        'Shipping Cost': newShipping !== null ? Number(newShipping) : (Number(firstRow['Shipping Cost'] ?? firstRow.Shipping ?? 0) || 0),
        Weight: Number(firstRow.Weight ?? firstRow.weight ?? 0) || 0,
        ShippingMethod: firstRow.ShippingMethod || firstRow.shipping_method || 'delivery',
        PaymentMethod: firstRow.PaymentMethod || firstRow.payment_method || 'transfer'
      }))

      const { data: insertedData, error: insertError } = await supabase
        .from('order')
        .insert(orderRows)
        .select()

      if (insertError) {
        throw new Error(insertError.message)
      }

      return {
        success: true,
        oldTotal: oldTotal,
        newTotal: newTotal,
        diff: newTotal - oldTotal,
        data: insertedData
      }
    } catch (error) {
      throw new Error(error.message || 'Could not edit order')
    }
  }
}
