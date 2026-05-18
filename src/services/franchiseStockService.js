import { supabase } from '../utils/supabase'
import { normalizeProduct } from '../utils/helpers'
import { orderItemNameFirstLine, parseBundleSelectionIdsFromItemName } from '../utils/orderBundleLineUtils'

/** มูลค่าต่อหน่วยสำหรับแดชบอร์ด: ใช้ต้นทุน (cost) ถ้ามี ไม่เช่นนั้นใช้ราคา (price จาก products หรือ franchise_stock) */
function getFranchiseStockUnitValue(item) {
  if (!item) return 0
  const cost = Number(item.cost)
  if (!Number.isNaN(cost) && cost > 0) return cost
  const price = Number(item.price)
  if (!Number.isNaN(price) && price > 0) return price
  const p = item.product
  if (p) {
    const pc = Number(p.cost)
    if (!Number.isNaN(pc) && pc > 0) return pc
    const pp = Number(p.price)
    if (!Number.isNaN(pp) && pp > 0) return pp
  }
  return 0
}

export const franchiseStockService = {
  // Get branch ID from user
  async getBranchId(userEmail, userObject = null) {
    try {
      // First, try to get from user object if provided (from localStorage)
      if (userObject && userObject.branchId) {
        console.log('[franchiseStockService] Branch ID from user object:', userObject.branchId)
        return userObject.branchId
      }

      // Try PascalCase first (as per Supabase dashboard)
      let { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('Email', userEmail)
        .maybeSingle()

      if (error) {
        console.error('[franchiseStockService] Error fetching branch ID (PascalCase):', error)
        // Try lowercase as fallback
        const result = await supabase
          .from('users')
          .select('*')
          .eq('email', userEmail.toLowerCase())
          .maybeSingle()
        
        if (result.error) {
          console.error('[franchiseStockService] Error fetching branch ID (lowercase):', result.error)
          return null
        }
        data = result.data
      }

      if (!data) {
        console.warn('[franchiseStockService] No user found with email:', userEmail)
        return null
      }

      // Try multiple column name variations
      const branchId = data.BranchId || data.branchid || data.Branch || data.branch || null
      
      console.log('[franchiseStockService] Branch ID lookup:', {
        email: userEmail,
        found: !!data,
        branchId: branchId,
        allKeys: Object.keys(data),
        BranchId: data.BranchId,
        branchid: data.branchid,
        Branch: data.Branch
      })

      if (!branchId) {
        console.warn('[franchiseStockService] Branch ID not found in user data. Available keys:', Object.keys(data))
      }

      return branchId
    } catch (error) {
      console.error('[franchiseStockService] Exception in getBranchId:', error)
      return null
    }
  },

  // Get all franchise stock for a branch
  async getFranchiseStock(branchId, search = '') {
    let query = supabase
      .from('franchise_stock')
      .select('*')
      .eq('branchid', branchId)

    if (search && search.trim()) {
      const searchTerm = search.trim()
      query = query.or(`productid.ilike.%${searchTerm}%,productname.ilike.%${searchTerm}%`)
    }

    query = query.order('productname', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Error fetching franchise stock:', error)
      throw new Error(error.message)
    }

    // Enrich with product details from products table
    if (data && data.length > 0) {
      const productIds = data.map(item => item.productid)
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .in('ProductID', productIds)

      const productMap = {}
      if (products) {
        products.forEach(p => {
          productMap[p.ProductID] = normalizeProduct(p, 'franchise')
        })
      }

      return data.map(item => ({
        ...item,
        product: productMap[item.productid] || null,
        unit: productMap[item.productid]?.unit || 'ชิ้น',
        cost: productMap[item.productid]?.cost || 0,
        // สินค้าเพิ่มเอง (ไม่มีใน products) ใช้ price จาก franchise_stock
        price: productMap[item.productid]?.price ?? item.price ?? 0
      }))
    }

    return data || []
  },

  // Get single product stock — ใช้ branchid + productid เป็น key
  // พยายาม exact match ก่อน แล้วค่อย fallback เป็น ilike แบบใส่ wildcard เฉพาะ productid
  async getProductStock(branchId, productId) {
    const id = String(productId ?? '').trim()
    if (!id) return null
    const branch = branchId != null ? String(branchId).trim() : ''
    if (!branch) return null

    // 1) ลอง exact match ก่อน
    let { data, error } = await supabase
      .from('franchise_stock')
      .select('*')
      .eq('branchid', branch)
      .eq('productid', id)
      .maybeSingle()

    if (error) {
      console.error('Error fetching product stock:', error)
      throw new Error(error.message)
    }

    // 2) ถ้า exact match ไม่เจอ ลอง fallback แบบ ilike (กรณีมีช่องว่าง/ตัวพิมพ์ไม่ตรง)
    if (!data) {
      const pattern = `%${id}%`
      const { data: rows, error: errIlike } = await supabase
        .from('franchise_stock')
        .select('*')
        .eq('branchid', branch)
        .ilike('productid', pattern)
        .limit(1)

      if (errIlike) {
        console.error('Error fetching product stock via ilike:', errIlike)
      } else if (rows && rows.length > 0) {
        data = rows[0]
        if (import.meta.env?.DEV) {
          console.log('[franchiseStockService] getProductStock found via ilike fallback:', {
            branch,
            requestedProductId: id,
            foundProductId: data?.productid,
            foundBranchId: data?.branchid
          })
        }
      }
    }

    return data
  },

  // Stock IN with custom type (for FROM_ORDER, FROM_PO) — รองรับสินค้าเพิ่มเองและสินค้าซัพนอก (ไม่มีใน products)
  // productNameOverride: ใช้เมื่อรับจาก PO ซัพนอก เพื่อให้เพิ่มเข้า franchise_stock ได้แม้ไม่มีใน products
  // isOtherSupplierPo: เมื่อ true และเป็นการ insert ใหม่ จะตั้ง iscustom: true
  async stockInWithType(branchId, productId, quantity, note, userEmail, logType = 'IN', orderId = null, poId = null, productNameOverride = null, isOtherSupplierPo = false) {
    console.log('[franchiseStockService] stockInWithType called:', { branchId, productId, quantity, logType, orderId, poId })

    const existingStock = await this.getProductStock(branchId, productId)
    let productName = (productNameOverride || '').toString().trim() || null

    if (!productName) {
      let { data: product, error: productError } = await supabase
        .from('products')
        .select('ProductID, ProductName')
        .eq('ProductID', productId)
        .maybeSingle()

      if (productError || !product) {
        const result = await supabase
          .from('products')
          .select('ProductID, ProductName, productid, productname')
          .eq('productid', productId)
          .maybeSingle()
        if (!result.error && result.data) {
          product = result.data
          productError = null
        }
      }

      if (product) {
        productName = product.ProductName || product.productname || ''
      } else if (existingStock) {
        productName = existingStock.productname || existingStock.productName || ''
      }
    }

    if (!productName && !existingStock) {
      const { data: osp } = await supabase
        .from('other_supplier_products')
        .select('productname')
        .eq('productid', String(productId).trim())
        .maybeSingle()
      if (osp && (osp.productname || '').toString().trim()) {
        productName = (osp.productname || '').toString().trim()
      }
    }

    if (!productName && !existingStock) {
      console.error('[franchiseStockService] Product not found:', { productId })
      throw new Error(`ไม่พบสินค้าในระบบ (ProductID: ${productId})`)
    }
    if (!productName) productName = ''
    console.log('[franchiseStockService] Found product:', { productId, productName })

    let currentStock = existingStock ? (existingStock.stock || 0) : 0
    const newStock = currentStock + quantity
    const newBalance = newStock

    // Update or insert stock
    if (existingStock) {
      const { error: updateError } = await supabase
        .from('franchise_stock')
        .update({
          stock: newStock,
          updatedat: new Date().toISOString()
        })
        .eq('branchid', existingStock.branchid ?? branchId)
        .eq('productid', existingStock.productid ?? productId)

      if (updateError) {
        console.error('Error updating franchise stock:', updateError)
        throw new Error(updateError.message)
      }
    } else {
      const insertPayload = {
        productid: productId,
        branchid: branchId,
        productname: productName,
        stock: newStock,
        minstock: 5
      }
      if (isOtherSupplierPo) insertPayload.iscustom = true
      const { error: insertError } = await supabase
        .from('franchise_stock')
        .insert(insertPayload)

      if (insertError) {
        console.error('Error inserting franchise stock:', insertError)
        throw new Error(insertError.message)
      }
    }

    const canonicalProductId = existingStock?.productid ?? productId
    const canonicalBranchId = existingStock?.branchid ?? branchId
    // Log stock movement with custom type
    const logData = {
      productid: canonicalProductId,
      productname: productName,
      branchid: canonicalBranchId,
      type: logType,
      quantity: quantity,
      balance: newBalance,
      note: note || 'รับเข้าสต็อก',
      useremail: userEmail
    }
    if (orderId) logData.orderid = orderId
    if (poId) logData.poid = poId

    const { error: logError } = await supabase
      .from('franchise_stock_logs')
      .insert(logData)

    if (logError) {
      console.error('Error logging stock movement:', logError)
      // Don't throw, stock is already updated
    }

    return { success: true, newStock: newBalance }
  },

  // Stock IN (รับเข้า) — รองรับทั้งสินค้าจากหน้าหลักและสินค้าเพิ่มเอง (ที่อยู่แค่ใน franchise_stock)
  async stockIn(branchId, productId, quantity, note, userEmail) {
    const existingStock = await this.getProductStock(branchId, productId)
    let productName = null

    const { data: product } = await supabase
      .from('products')
      .select('ProductID, ProductName')
      .eq('ProductID', productId)
      .maybeSingle()

    if (product) {
      productName = product.ProductName || product.productname || ''
    } else if (existingStock) {
      productName = existingStock.productname || existingStock.productName || ''
    }
    if (!productName && !existingStock) {
      throw new Error('ไม่พบสินค้าในระบบ')
    }
    if (!productName) productName = ''

    let currentStock = existingStock ? (existingStock.stock || 0) : 0
    const newStock = currentStock + quantity
    const newBalance = newStock

    if (existingStock) {
      const { error: updateError } = await supabase
        .from('franchise_stock')
        .update({
          stock: newStock,
          updatedat: new Date().toISOString()
        })
        .eq('branchid', existingStock.branchid ?? branchId)
        .eq('productid', existingStock.productid ?? productId)

      if (updateError) {
        console.error('Error updating franchise stock:', updateError)
        throw new Error(updateError.message)
      }
    } else {
      const { error: insertError } = await supabase
        .from('franchise_stock')
        .insert({
          productid: productId,
          branchid: branchId,
          productname: productName,
          stock: newStock,
          minstock: 5
        })

      if (insertError) {
        console.error('Error inserting franchise stock:', insertError)
        throw new Error(insertError.message)
      }
    }

    const canonicalProductId = existingStock?.productid ?? productId
    const canonicalBranchId = existingStock?.branchid ?? branchId
    const { error: logError } = await supabase
      .from('franchise_stock_logs')
      .insert({
        productid: canonicalProductId,
        productname: productName,
        branchid: canonicalBranchId,
        type: 'IN',
        quantity: quantity,
        balance: newBalance,
        note: note || 'รับเข้าสต็อก',
        useremail: userEmail
      })

    if (logError) {
      console.error('Error logging stock movement:', logError)
    }

    return { success: true, newStock: newBalance }
  },

  // Stock OUT (เบิกออก) — รองรับทั้งสินค้าจากหน้าหลักและสินค้าเพิ่มเอง
  async stockOut(branchId, productId, quantity, note, userEmail) {
    const existingStock = await this.getProductStock(branchId, productId)
    if (!existingStock || (existingStock.stock ?? 0) <= 0) {
      throw new Error('สินค้านี้ยังไม่มีในสต็อก')
    }

    let productName = existingStock.productname || existingStock.productName
    if (!productName) {
      const { data: product } = await supabase
        .from('products')
        .select('ProductID, ProductName')
        .eq('ProductID', productId)
        .maybeSingle()
      productName = product?.ProductName || product?.productname || ''
    }

    const currentStock = existingStock.stock || 0
    if (currentStock < quantity) {
      throw new Error(`สต็อกไม่พอ (มี ${currentStock} ชิ้น)`)
    }

    const newStock = currentStock - quantity
    const newBalance = newStock

    const { error: updateError } = await supabase
      .from('franchise_stock')
      .update({
        stock: newStock,
        updatedat: new Date().toISOString()
      })
      .eq('branchid', existingStock.branchid ?? branchId)
      .eq('productid', existingStock.productid ?? productId)

    if (updateError) {
      console.error('Error updating franchise stock:', updateError)
      throw new Error(updateError.message)
    }

    const { error: logError } = await supabase
      .from('franchise_stock_logs')
      .insert({
        productid: existingStock.productid ?? productId,
        productname: productName || '',
        branchid: existingStock.branchid ?? branchId,
        type: 'OUT',
        quantity: quantity,
        balance: newBalance,
        note: note || 'เบิกออกสต็อก',
        useremail: userEmail
      })

    if (logError) {
      console.error('Error logging stock movement:', logError)
      // Don't throw, stock is already updated
    }

    return { success: true, newStock: newBalance }
  },

  // Update min stock
  async updateMinStock(branchId, productId, minStock) {
    const existing = await this.getProductStock(branchId, productId)
    if (!existing) throw new Error('ไม่พบสินค้าในสต็อกสาขา')
    const { error } = await supabase
      .from('franchise_stock')
      .update({
        minstock: minStock,
        updatedat: new Date().toISOString()
      })
      .eq('branchid', existing.branchid ?? branchId)
      .eq('productid', existing.productid ?? productId)

    if (error) {
      console.error('Error updating min stock:', error)
      throw new Error(error.message)
    }

    return { success: true }
  },

  // Get low stock items
  async getLowStockItems(branchId) {
    const { data, error } = await supabase
      .from('franchise_stock')
      .select('*')
      .eq('branchid', branchId)
      .lte('stock', supabase.raw('minstock'))

    if (error) {
      console.error('Error fetching low stock items:', error)
      throw new Error(error.message)
    }

    return data || []
  },

  // Get stock logs
  async getStockLogs(branchId, filters = {}) {
    let query = supabase
      .from('franchise_stock_logs')
      .select('*', { count: 'exact' })
      .eq('branchid', branchId)

    if (filters.type && filters.type !== 'all') {
      query = query.eq('type', filters.type)
    }

    if (filters.startDate) {
      query = query.gte('timestamp', filters.startDate)
    }

    if (filters.endDate) {
      query = query.lte('timestamp', filters.endDate)
    }

    if (filters.search) {
      const searchTerm = filters.search.trim()
      query = query.or(`productid.ilike.%${searchTerm}%,productname.ilike.%${searchTerm}%,note.ilike.%${searchTerm}%`)
    }

    query = query.order('timestamp', { ascending: false })

    if (filters.page && filters.itemsPerPage) {
      const from = (filters.page - 1) * filters.itemsPerPage
      const to = from + filters.itemsPerPage - 1
      query = query.range(from, to)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching stock logs:', error)
      throw new Error(error.message)
    }

    return { data: data || [], count: count || 0 }
  },

  // Add product from main products table
  async addProductFromMain(branchId, productId, initialStock, initialMinStock, userEmail) {
    try {
      productId = String(productId ?? '').trim()
      if (!productId) throw new Error('รหัสสินค้า (ProductID) ไม่ได้ระบุ')
      // Get product info from products table
      let { data: product, error: productError } = await supabase
        .from('products')
        .select('ProductID, ProductName')
        .eq('ProductID', productId)
        .maybeSingle()

      if (productError || !product) {
        // Try lowercase
        const result = await supabase
          .from('products')
          .select('ProductID, ProductName, productid, productname')
          .eq('productid', productId)
          .maybeSingle()
        
        if (!result.error && result.data) {
          product = result.data
        } else {
          throw new Error('ไม่พบสินค้าในระบบ')
        }
      }

      const productName = product.ProductName || product.productname || ''
      
      // Check if product already exists in franchise_stock
      const existing = await this.getProductStock(branchId, productId)
      if (existing) {
        throw new Error('สินค้านี้มีอยู่ในสต็อกแล้ว')
      }

      // Insert into franchise_stock
      const { error: insertError } = await supabase
        .from('franchise_stock')
        .insert({
          productid: productId,
          branchid: branchId,
          productname: productName,
          stock: Number(initialStock) || 0,
          minstock: Number(initialMinStock) || 5
        })

      if (insertError) {
        console.error('Error adding product to franchise stock:', insertError)
        throw new Error(insertError.message)
      }

      // Log stock movement
      const { error: logError } = await supabase
        .from('franchise_stock_logs')
        .insert({
          productid: productId,
          productname: productName,
          branchid: branchId,
          type: 'ADD',
          quantity: Number(initialStock) || 0,
          balance: Number(initialStock) || 0,
          note: 'เพิ่มสินค้าจากหน้าหลัก',
          useremail: userEmail
        })

      if (logError) {
        console.error('Error logging stock movement:', logError)
        // Don't throw, stock is already added
      }

      return { success: true }
    } catch (error) {
      console.error('Error adding product from main:', error)
      throw error
    }
  },

  // Add custom product (not in main products table)
  async addCustomProduct(branchId, productId, productName, price, initialStock, initialMinStock, userEmail) {
    try {
      productId = String(productId ?? '').trim()
      if (!productId) throw new Error('รหัสสินค้า (ProductID) ไม่ได้ระบุ')
      // Check if product already exists in franchise_stock (ตรวจสอบซ้ำจาก productid)
      const existing = await this.getProductStock(branchId, productId)
      if (existing) {
        throw new Error('ProductID นี้มีอยู่ในสต็อกแล้ว')
      }

      // Check if productId exists in products table (should not exist for custom products)
      let { data: productInMain } = await supabase
        .from('products')
        .select('ProductID')
        .eq('ProductID', productId)
        .maybeSingle()

      if (!productInMain) {
        // Try lowercase
        const result = await supabase
          .from('products')
          .select('productid')
          .eq('productid', productId)
          .maybeSingle()
        productInMain = result.data
      }

      if (productInMain) {
        throw new Error('ProductID นี้มีอยู่ในหน้าหลักแล้ว กรุณาใช้ "เพิ่มจากหน้าหลัก" แทน')
      }

      // Insert into franchise_stock
      const { error: insertError } = await supabase
        .from('franchise_stock')
        .insert({
          productid: productId,
          branchid: branchId,
          productname: productName,
          stock: Number(initialStock) || 0,
          minstock: Number(initialMinStock) || 5,
          price: Number(price) || 0,
          iscustom: true // Flag to indicate this is a custom product (cannot create PO)
        })

      if (insertError) {
        console.error('Error adding custom product to franchise stock:', insertError)
        throw new Error(insertError.message)
      }

      // Log stock movement
      const { error: logError } = await supabase
        .from('franchise_stock_logs')
        .insert({
          productid: productId,
          productname: productName,
          branchid: branchId,
          type: 'ADD',
          quantity: Number(initialStock) || 0,
          balance: Number(initialStock) || 0,
          note: 'เพิ่มสินค้าใหม่เอง',
          useremail: userEmail
        })

      if (logError) {
        console.error('Error logging stock movement:', logError)
        // Don't throw, stock is already added
      }

      return { success: true }
    } catch (error) {
      console.error('Error adding custom product:', error)
      throw error
    }
  },

  /**
   * เพิ่มสินค้าจากรายการซัพอื่นๆ (ตาราง other_supplier_products) เข้า franchise_stock
   * เหมือน addCustomProduct แต่ไม่ตรวจว่า productid อยู่ในหน้าหลักหรือไม่ และใช้ note อื่น
   */
  async addProductFromOtherSupplier(branchId, productId, productName, price, initialStock, initialMinStock, userEmail) {
    try {
      productId = String(productId ?? '').trim()
      if (!productId) throw new Error('รหัสสินค้า (ProductID) ไม่ได้ระบุ')
      const existing = await this.getProductStock(branchId, productId)
      if (existing) {
        throw new Error('ProductID นี้มีอยู่ในสต็อกแล้ว')
      }

      const { error: insertError } = await supabase
        .from('franchise_stock')
        .insert({
          productid: productId,
          branchid: branchId,
          productname: productName,
          stock: Number(initialStock) || 0,
          minstock: Number(initialMinStock) || 5,
          price: Number(price) || 0,
          iscustom: true
        })

      if (insertError) {
        console.error('Error adding product from other supplier:', insertError)
        throw new Error(insertError.message)
      }

      const { error: logError } = await supabase
        .from('franchise_stock_logs')
        .insert({
          productid: productId,
          productname: productName,
          branchid: branchId,
          type: 'ADD',
          quantity: Number(initialStock) || 0,
          balance: Number(initialStock) || 0,
          note: 'เพิ่มสินค้าจากรายการซัพอื่นๆ',
          useremail: userEmail
        })

      if (logError) console.error('Error logging stock movement:', logError)
      return { success: true }
    } catch (error) {
      console.error('Error adding product from other supplier:', error)
      throw error
    }
  },

  /**
   * เพิ่มสินค้าใหม่เองหลายรายการจาก CSV (เรียก addCustomProduct ทีละรายการ)
   * @param {string} branchId
   * @param {Array<{ productId: string, productName: string, price: number, stock: number, minStock: number }>} rows
   * @param {string} userEmail
   * @returns {{ successCount: number, failCount: number, errors: Array<{ row: number, productId?: string, message: string }> }}
   */
  async addCustomProductsBulk(branchId, rows, userEmail) {
    const errors = []
    let successCount = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const productId = String(row.productId || '').trim()
      const productName = String(row.productName || '').trim()
      if (!productId || !productName) {
        errors.push({ row: i + 1, productId: productId || '(ว่าง)', message: 'Product ID และชื่อสินค้าต้องไม่ว่าง' })
        continue
      }
      try {
        await this.addCustomProduct(
          branchId,
          productId,
          productName,
          Number(row.price) || 0,
          Math.max(0, parseInt(String(row.stock), 10) || 0),
          Math.max(0, parseInt(String(row.minStock), 10) || 5),
          userEmail
        )
        successCount++
      } catch (err) {
        errors.push({ row: i + 1, productId, message: err.message || 'ไม่สามารถเพิ่มได้' })
      }
    }
    return { successCount, failCount: errors.length, errors }
  },

  // แก้ไขสินค้าเพิ่มเอง (เฉพาะ iscustom = true)
  async updateCustomProduct(branchId, productId, { productName, minstock, price }) {
    const existing = await this.getProductStock(branchId, productId)
    if (!existing) throw new Error('ไม่พบสินค้าในสต็อกสาขา')
    const { error } = await supabase
      .from('franchise_stock')
      .update({
        ...(productName != null && { productname: String(productName).trim() }),
        ...(minstock != null && { minstock: Number(minstock) >= 0 ? Number(minstock) : 0 }),
        ...(price != null && { price: Number(price) >= 0 ? Number(price) : 0 })
      })
      .eq('branchid', existing.branchid ?? branchId)
      .eq('productid', existing.productid ?? productId)
      .eq('iscustom', true)

    if (error) {
      console.error('Error updating custom product:', error)
      throw new Error(error.message)
    }
    return { success: true }
  },

  // ลบสินค้าออกจากสต็อกแฟรนไชส์ (ทั้งสินค้าส่วนกลางและสินค้าเพิ่มเอง)
  async removeFromFranchiseStock(branchId, productId) {
    const existing = await this.getProductStock(branchId, productId)
    if (!existing) throw new Error('ไม่พบสินค้าในสต็อกสาขา')
    const { error } = await supabase
      .from('franchise_stock')
      .delete()
      .eq('branchid', existing.branchid ?? branchId)
      .eq('productid', existing.productid ?? productId)

    if (error) {
      console.error('Error removing from franchise stock:', error)
      throw new Error(error.message)
    }
    return { success: true }
  },

  /**
   * ดึงรายการ branchid ที่มีข้อมูลใน franchise_stock (ใช้สำหรับ dropdown โคลนจากสาขา)
   * @param {string} [excludeBranchId] - ไม่รวมสาขานี้ (เช่น สาขาปัจจุบัน)
   */
  async getBranchIdsWithStock(excludeBranchId = null) {
    const { data, error } = await supabase
      .from('franchise_stock')
      .select('branchid')
    if (error) {
      console.error('Error fetching branch IDs:', error)
      throw new Error(error.message)
    }
    const set = new Set()
    ;(data || []).forEach(row => {
      const b = (row.branchid ?? row.branchId ?? '').toString().trim()
      if (b && (!excludeBranchId || b !== excludeBranchId)) set.add(b)
    })
    return Array.from(set).sort()
  },

  /**
   * โคลนรายการสินค้าสต็อกแฟรนไชส์จากสาขาต้นแบบ (เช่น SA000) มายังสาขาปัจจุบัน
   * ดึงเฉพาะรายการ (productid, productname, minstock, price, iscustom) — จำนวนสต็อกตั้งเป็น 0
   * รายการที่มีอยู่แล้วในสาขาปลายทางจะข้าม
   * @param {string} sourceBranchId - รหัสสาขาต้นแบบ (เช่น SA000)
   * @param {string} targetBranchId - รหัสสาขาที่จะโคลนเข้า
   * @param {string} userEmail
   * @returns {{ added: number, skipped: number, errors: string[] }}
   */
  async cloneFranchiseStockFromBranch(sourceBranchId, targetBranchId, userEmail) {
    if (!sourceBranchId || !targetBranchId || sourceBranchId === targetBranchId) {
      throw new Error('กรุณาเลือกสาขาต้นแบบที่แตกต่างจากสาขาปัจจุบัน')
    }
    const source = String(sourceBranchId).trim()
    const target = String(targetBranchId).trim()

    const { data: sourceRows, error: fetchError } = await supabase
      .from('franchise_stock')
      .select('productid, productname, minstock, price, iscustom')
      .eq('branchid', source)

    if (fetchError) {
      console.error('Error fetching source franchise stock:', fetchError)
      throw new Error(fetchError.message)
    }
    if (!sourceRows || sourceRows.length === 0) {
      return { added: 0, skipped: 0, errors: ['สาขาต้นแบบไม่มีรายการสินค้า'] }
    }

    const existingTarget = await this.getFranchiseStock(target, '')
    const existingIds = new Set((existingTarget || []).map(item => (item.productid || '').toString().trim()).filter(Boolean))

    let added = 0
    let skipped = 0
    const errors = []

    for (const row of sourceRows) {
      const productid = (row.productid ?? '').toString().trim()
      const productname = (row.productname ?? row.productName ?? '').toString().trim()
      if (!productid || !productname) {
        errors.push(`ข้าม: รหัสหรือชื่อว่าง (${productid || '(ว่าง)'})`)
        continue
      }
      if (existingIds.has(productid)) {
        skipped++
        continue
      }

      const { error: insertError } = await supabase
        .from('franchise_stock')
        .insert({
          productid,
          branchid: target,
          productname,
          stock: 0,
          minstock: Math.max(0, Number(row.minstock) ?? 5),
          price: Math.max(0, Number(row.price) ?? 0),
          iscustom: !!row.iscustom
        })

      if (insertError) {
        errors.push(`${productid}: ${insertError.message}`)
        continue
      }

      const { error: logError } = await supabase
        .from('franchise_stock_logs')
        .insert({
          productid,
          productname,
          branchid: target,
          type: 'ADD',
          quantity: 0,
          balance: 0,
          note: `โคลนรายการจากสาขา ${source}`,
          useremail: userEmail
        })
      if (logError) console.error('Log error:', logError)

      added++
      existingIds.add(productid)
    }

    return { added, skipped, errors }
  },

  // Import stock from order
  // Check if order has been imported
  async isOrderImported(branchId, orderId) {
    try {
      const { data, error } = await supabase
        .from('franchise_stock_logs')
        .select('id')
        .eq('branchid', branchId)
        .eq('orderid', orderId)
        .eq('type', 'FROM_ORDER')
        .limit(1)

      if (error) {
        console.error('[franchiseStockService] Error checking order import:', error)
        return false
      }

      return data && data.length > 0
    } catch (error) {
      console.error('[franchiseStockService] Error in isOrderImported:', error)
      return false
    }
  },

  async importFromOrder(branchId, orderId, userEmail) {
    console.log('[franchiseStockService] importFromOrder called:', { branchId, orderId, userEmail })
    
    // Get order details - order table stores each item as a separate row
    // Try multiple column name variations
    let { data: orderRows, error: orderError } = await supabase
      .from('order')
      .select('*')
      .eq('OrderID', orderId)

    // If not found, try lowercase
    if (orderError || !orderRows || orderRows.length === 0) {
      console.log('[franchiseStockService] Trying lowercase OrderID...')
      const result = await supabase
        .from('order')
        .select('*')
        .eq('orderid', orderId)
      
      if (!result.error && result.data && result.data.length > 0) {
        orderRows = result.data
        orderError = null
      }
    }

    if (orderError) {
      console.error('[franchiseStockService] Error fetching order:', orderError)
      throw new Error(`ไม่พบออเดอร์: ${orderError.message}`)
    }

    if (!orderRows || orderRows.length === 0) {
      console.error('[franchiseStockService] No order rows found for orderId:', orderId)
      throw new Error('ไม่พบออเดอร์')
    }

    console.log('[franchiseStockService] Found order rows:', orderRows.length)

    // Get first row to check status
    const firstRow = orderRows[0]
    const status = firstRow.Status || firstRow.status || ''
    console.log('[franchiseStockService] Order status:', status)
    
    if (!['จัดส่งแล้ว', 'completed', 'delivered'].includes(status)) {
      throw new Error('ออเดอร์ยังไม่ได้รับการจัดส่ง')
    }

    // Each row is an order item
    const results = []
    for (const row of orderRows) {
      try {
        // Use correct column names from order table: ItemName, Qty, Price
        const itemName = row.ItemName || row.itemname || row.Itemname || ''
        const quantity = Number(row.Qty || row.qty || 0)
        const cleanItemName = orderItemNameFirstLine(itemName)
        const rowProductId = String(row.ProductID || row.productid || '').trim()
        const bundleMoves = parseBundleSelectionIdsFromItemName(itemName)
        
        console.log('[franchiseStockService] Processing item:', {
          itemName,
          cleanItemName,
          rowProductId,
          quantity,
          bundleMovesCount: bundleMoves.size,
          rowKeys: Object.keys(row)
        })

        if (!itemName || quantity <= 0) {
          console.warn('[franchiseStockService] Skipping item - missing name or invalid quantity:', { itemName, quantity })
          continue
        }

        const importsToProcess = []

        // 1) Bundle line: use BUNDLE_IDS as highest priority because it is explicit component mapping
        if (bundleMoves.size > 0) {
          for (const [bundlePid, bundleQty] of bundleMoves.entries()) {
            const pid = String(bundlePid || '').trim()
            const qty = Math.max(0, Math.round(Number(bundleQty) || 0))
            if (!pid || qty <= 0) continue
            importsToProcess.push({
              productId: pid,
              quantity: qty,
              productNameHint: cleanItemName || itemName,
              importSource: 'BUNDLE_IDS'
            })
          }
        } else {
          // 2) Non-bundle (or no BUNDLE_IDS): use ProductID from row first
          let productId = rowProductId || null
          let productName = null

          // 3) Fallback: resolve by first-line item name (without BUNDLE_IDS/options text)
          if (!productId) {
            const nameForLookup = (cleanItemName || itemName).trim()
            let { data: products, error: productError } = await supabase
              .from('products')
              .select('ProductID, ProductName')
              .ilike('ProductName', `%${nameForLookup}%`)
              .limit(5)

            if (productError || !products || products.length === 0) {
              console.log('[franchiseStockService] Trying lowercase productname...')
              const result = await supabase
                .from('products')
                .select('ProductID, ProductName, productid, productname')
                .ilike('productname', `%${nameForLookup}%`)
                .limit(5)

              if (!result.error && result.data && result.data.length > 0) {
                products = result.data
                productError = null
              }
            }

            if (productError) {
              console.error('[franchiseStockService] Error finding product:', productError)
            } else if (products && products.length > 0) {
              const exactMatch = products.find((p) => {
                const pName = (p.ProductName || p.productname || '').trim().toLowerCase()
                return pName === nameForLookup.toLowerCase()
              })

              if (exactMatch) {
                productId = exactMatch.ProductID || exactMatch.productid
                productName = exactMatch.ProductName || exactMatch.productname
              } else {
                productId = products[0].ProductID || products[0].productid
                productName = products[0].ProductName || products[0].productname
              }
            }
          }

          if (!productId) {
            console.error('[franchiseStockService] Product not found for item name:', itemName)
            results.push({
              productId: '',
              productName: cleanItemName || itemName,
              quantity,
              success: false,
              error: `ไม่พบสินค้า "${cleanItemName || itemName}" ในระบบ`
            })
            continue
          }

          importsToProcess.push({
            productId: String(productId).trim(),
            quantity,
            productNameHint: productName || cleanItemName || itemName,
            importSource: rowProductId ? 'ORDER_PRODUCT_ID' : 'ITEM_NAME_FALLBACK'
          })
        }

        for (const target of importsToProcess) {
          await this.stockInWithType(
            branchId,
            target.productId,
            target.quantity,
            `นำเข้าจากออเดอร์ ${orderId}`,
            userEmail,
            'FROM_ORDER',
            orderId
          )

          results.push({
            productId: target.productId,
            productName: target.productNameHint,
            quantity: target.quantity,
            success: true,
            importSource: target.importSource
          })
          console.log('[franchiseStockService] Successfully imported:', {
            productId: target.productId,
            productName: target.productNameHint,
            quantity: target.quantity
          })
        }
      } catch (error) {
        console.error('[franchiseStockService] Error importing item:', error)
        const itemName = row.ItemName || row.itemname || row.Itemname || ''
        results.push({ 
          productId: '', 
          productName: itemName,
          quantity: Number(row.Qty || row.qty || 0), 
          success: false, 
          error: error.message || 'เกิดข้อผิดพลาดในการนำเข้า'
        })
      }
    }

    console.log('[franchiseStockService] Import results:', results)
    return { success: true, results }
  },

  // Get dashboard stats
  // dateOrOptions: string 'yyyy-mm-dd' (วันเดียว, backward compatible) หรือ { startDate, endDate, showAllDates }
  async getDashboardStats(branchId, dateOrOptions) {
    let startISO = null
    let endISO = null
    let unboundedOut = false

    if (dateOrOptions == null || dateOrOptions === '') {
      unboundedOut = true
    } else if (typeof dateOrOptions === 'string') {
      startISO = new Date(dateOrOptions + 'T00:00:00').toISOString()
      endISO = new Date(dateOrOptions + 'T23:59:59.999').toISOString()
    } else {
      const { startDate, endDate, showAllDates } = dateOrOptions
      if (showAllDates || (!startDate && !endDate)) {
        unboundedOut = true
      } else {
        if (startDate) startISO = new Date(startDate + 'T00:00:00').toISOString()
        if (endDate) endISO = new Date(endDate + 'T23:59:59.999').toISOString()
      }
    }

    // Get stock out logs (ตามช่วงวันที่ หรือทั้งหมด)
    let outQuery = supabase
      .from('franchise_stock_logs')
      .select('*')
      .eq('branchid', branchId)
      .eq('type', 'OUT')

    if (!unboundedOut) {
      if (startISO) outQuery = outQuery.gte('timestamp', startISO)
      if (endISO) outQuery = outQuery.lte('timestamp', endISO)
    }

    const { data: outLogs } = await outQuery

    // Get current stock with product details
    const stockItems = await this.getFranchiseStock(branchId)

    // Create product map for quick lookup (รองรับ productid ต่างตัวพิมพ์ระหว่าง log กับ franchise_stock)
    const productMap = {}
    const productMapByNormKey = {}
    stockItems.forEach(item => {
      const id = item.productid
      productMap[id] = item
      const norm = String(id ?? '').trim().toLowerCase()
      if (norm && !productMapByNormKey[norm]) productMapByNormKey[norm] = item
    })

    const resolveStockRow = (productId) => {
      if (productId == null || productId === '') return null
      return (
        productMap[productId] ||
        productMap[String(productId).trim()] ||
        productMapByNormKey[String(productId).trim().toLowerCase()]
      )
    }

    // Calculate values (รองรับกรณีไม่มี Cost ในตาราง products — ใช้ price จาก franchise_stock / normalizeProduct)
    let totalOutValue = 0
    let totalStockValue = 0

    if (outLogs) {
      for (const log of outLogs) {
        const row = resolveStockRow(log.productid)
        const unit = getFranchiseStockUnitValue(row)
        if (unit > 0) {
          totalOutValue += (log.quantity || 0) * unit
        }
      }
    }

    for (const item of stockItems) {
      const unit = getFranchiseStockUnitValue(item)
      if (unit > 0) {
        totalStockValue += (item.stock || 0) * unit
      }
    }

    const meta =
      typeof dateOrOptions === 'string'
        ? { singleDate: dateOrOptions }
        : {
            startDate: dateOrOptions?.startDate || null,
            endDate: dateOrOptions?.endDate || null,
            showAllDates: !!(dateOrOptions && dateOrOptions.showAllDates)
          }

    return {
      totalOutValue,
      totalStockValue,
      totalOutQuantity: outLogs?.reduce((sum, log) => sum + (log.quantity || 0), 0) || 0,
      totalStockQuantity: stockItems.reduce((sum, item) => sum + (item.stock || 0), 0),
      date:
        typeof dateOrOptions === 'string'
          ? dateOrOptions || new Date().toISOString().split('T')[0]
          : null,
      rangeMeta: meta
    }
  }
}
