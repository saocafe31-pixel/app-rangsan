import { supabase } from '../utils/supabase'
import {
  normalizeProduct,
  normalizeProducts,
  serializeAllowedViewerEmailsToJson,
  buildProductTextSearchOrFilter
} from '../utils/helpers'
import { sanitizePriceTiersForDb } from '../utils/priceTiers'

function sanitizeProductOptionsForDb(opts) {
  if (!Array.isArray(opts)) return []
  return opts
    .map((o) => ({
      name: String(o?.name ?? '').trim(),
      required: Boolean(o?.required),
      values: Array.isArray(o?.values)
        ? o.values
            .map((v) => ({
              label: String(v?.label ?? v ?? '').trim(),
              price: Math.max(0, Number(v?.price) || 0)
            }))
            .filter((v) => v.label)
        : []
    }))
    .filter((o) => o.name && o.values.length > 0)
}

function sanitizeBundleLinesForDb(lines, bundleFlexible = false) {
  if (!Array.isArray(lines)) return []
  const mapped = lines.map((l) => ({
    productId: String(l?.productId ?? '').trim(),
    qty: Math.max(0, Number(l?.qty) || 0)
  }))
  if (bundleFlexible) {
    return mapped.filter((l) => l.productId)
  }
  return mapped.filter((l) => l.productId && l.qty > 0)
}

/** ตัวเลขลง DB — กันค่า NaN/Infinity ที่ทำให้ PostgREST คืน 400 */
function toDbNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(/\s/g, ''))
  return Number.isFinite(n) ? n : fallback
}

function requireDbNumber(value, fieldLabelThai) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim().replace(/\s/g, ''))
  if (!Number.isFinite(n)) {
    throw new Error(`${fieldLabelThai} ต้องเป็นตัวเลขที่ถูกต้อง`)
  }
  return n
}

function formatSupabaseError(err) {
  if (!err) return 'ไม่ทราบข้อผิดพลาด'
  const parts = [err.message].filter(Boolean)
  if (err.details) parts.push(String(err.details))
  if (err.hint) parts.push(String(err.hint))
  if (err.code) parts.push(`รหัส: ${err.code}`)
  return parts.join(' — ')
}

export const productService = {
  // Get products with pagination
  // If itemsPerPage is null or 0, fetch all products without pagination
  async getProducts(user, page = 0, itemsPerPage = 50, search = '') {
    // If itemsPerPage is null or 0, fetch all products using recursive method
    if (!itemsPerPage || itemsPerPage === 0) {
      return this.getAllProducts(user, search)
    }

    let query = supabase
      .from('products')
      .select('*')

    // การกรองมองเห็นบนหน้าแคตตาล็อกทำที่ฝั่ง client (useProducts / Home) ตาม VisibleOnHome และกลุ่มลูกค้า

    if (search && search.trim()) {
      const orClause = buildProductTextSearchOrFilter(search)
      if (orClause) query = query.or(orClause)
    }

    // Apply pagination
    const from = page * itemsPerPage
    const to = from + itemsPerPage - 1
    query = query.range(from, to).order('ProductName', { ascending: true })

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    // Get userType from user object (userType or customerType)
    const userType = user?.userType || user?.customerType || 'regular'
    return normalizeProducts(data || [], userType)
  },

  // Get all products without pagination limit (recursive fetch)
  async getAllProducts(user, search = '') {
    let allProducts = []
    let from = 0
    const batchSize = 1000 // Supabase default limit
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from('products')
        .select('*')

      if (search && search.trim()) {
        const orClause = buildProductTextSearchOrFilter(search)
        if (orClause) query = query.or(orClause)
      }

      query = query.range(from, from + batchSize - 1).order('ProductName', { ascending: true })

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      if (data && data.length > 0) {
        allProducts = allProducts.concat(data)
        from += batchSize
        hasMore = data.length === batchSize // If we got less than batchSize, we've reached the end
      } else {
        hasMore = false
      }
    }

    // Get userType from user object (userType or customerType)
    const userType = user?.userType || user?.customerType || 'regular'
    return normalizeProducts(allProducts, userType)
  },

  // Get single product (ใช้ limit(1) แทน maybeSingle เพื่อไม่ให้ error เมื่อมีหลายแถว ProductID ซ้ำ)
  async getProduct(productId, userForNormalize = null) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('ProductID', productId)
      .limit(1)

    if (error) {
      throw new Error(error.message)
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    const userType = userForNormalize?.userType || userForNormalize?.customerType || 'regular'
    return row ? normalizeProduct(row, userType) : null
  },

  /** ตรวจสอบว่ารหัสสินค้า (ProductID) มีอยู่ในระบบแล้วหรือไม่ — ใช้ป้องกันการเพิ่มรหัสซ้ำ */
  async isProductIdExists(productId) {
    if (!productId || String(productId).trim() === '') return false
    const id = String(productId).trim()
    const { data, error } = await supabase
      .from('products')
      .select('ProductID')
      .eq('ProductID', id)
      .limit(1)
    if (error) throw new Error(error.message)
    return Array.isArray(data) && data.length > 0
  },

  // Get low stock count (for badge) - ใช้ lowStockThreshold จาก settings เมื่อสินค้าไม่มี MinStock
  async getLowStockCount() {
    try {
      const { getNotificationsSettings } = await import('./shopSettingsService')
      const { lowStockThreshold } = await getNotificationsSettings()
      const defaultMin = Math.max(0, Number(lowStockThreshold) || 5)

      const { data, error } = await supabase
        .from('products')
        .select('Stock, MinStock, ProductID')

      if (error) {
        console.error('Error fetching products for low stock count:', error)
        throw error
      }

      if (!data || data.length === 0) {
        console.log('No products found for low stock count')
        return 0
      }

      const lowStockCount = data.filter(p => {
        const stock = Number(p.Stock || p.stock || 0) || 0
        const minStock = Number(p.MinStock ?? p.minStock ?? p.min_stock ?? defaultMin) || defaultMin
        return stock <= minStock
      }).length

      console.log(`[Low Stock Count] Found ${lowStockCount} products with low stock out of ${data.length} total products`)
      return lowStockCount
    } catch (error) {
      console.error('Error getting low stock count:', error)
      return 0
    }
  },

  // Update product — รองรับการแก้ไขรหัสสินค้า (ProductID) โดยอัปเดต franchise_stock และ franchise_stock_logs ด้วย
  async updateProduct(productId, updates) {
    const newProductId = (updates.id || '').trim()
    const isChangingId = newProductId && newProductId !== productId

    if (isChangingId) {
      const exists = await this.isProductIdExists(newProductId)
      if (exists) {
        throw new Error(`รหัสสินค้า "${newProductId}" มีอยู่แล้ว กรุณาใช้รหัสอื่น`)
      }
    }

    const priceNum = requireDbNumber(updates.price, 'ราคา')
    const updateData = {
      ProductName: updates.name,
      Price: priceNum,
      Stock: toDbNumber(updates.stock, 0),
      Image: updates.image,
      Category: updates.category,
      Detail: updates.detail,
      Supplier: updates.supplier,
      Unit: updates.unit,
      Weight: toDbNumber(updates.weight, 0),
      MinStock: Math.max(0, toDbNumber(updates.minStock, 5)),
      FranchisePrice: toDbNumber(updates.franchisePrice, priceNum),
      OrderStep: Math.max(1, parseInt(updates.orderStep, 10) || 1)
    }
    if (isChangingId) {
      updateData.ProductID = newProductId
    }
    if (updates.cost !== undefined && updates.cost !== null && updates.cost !== '') {
      updateData.Cost = requireDbNumber(updates.cost, 'ต้นทุน')
    }

    updateData.VisibleOnHome = updates.visibleOnHome !== false
    updateData.SaleToFranchise = updates.saleToFranchise !== false
    updateData.SaleToRegular = updates.saleToRegular !== false
    updateData.SaleRestrictedToUsers = updates.saleRestrictedToUsers === true
    updateData.AllowedViewerEmails = serializeAllowedViewerEmailsToJson(
      updates.allowedViewerEmailsText != null ? updates.allowedViewerEmailsText : ''
    )
    updateData.IsBundle = updates.isBundle === true
    updateData.BundleFlexible = updates.isBundle === true && updates.bundleFlexible === true
    updateData.BundleComponentSumEqualsPrimary =
      updates.isBundle === true &&
      updates.bundleFlexible === true &&
      updates.bundleComponentSumEqualsPrimary === true
    updateData.BundlePrimaryProductId =
      updateData.BundleFlexible && updates.bundlePrimaryProductId
        ? String(updates.bundlePrimaryProductId).trim()
        : null
    updateData.ProductOptions = sanitizeProductOptionsForDb(updates.productOptions)
    updateData.BundleLines = sanitizeBundleLinesForDb(updates.bundleLines, updateData.BundleFlexible)
    if (updates.priceTiers !== undefined) {
      updateData.PriceTiers = sanitizePriceTiersForDb(updates.priceTiers, updateData.OrderStep)
    }

    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('ProductID', productId)

    if (error) {
      throw new Error(formatSupabaseError(error))
    }

    if (isChangingId) {
      await supabase.from('franchise_stock').update({ productid: newProductId }).eq('productid', productId)
      await supabase.from('franchise_stock_logs').update({ productid: newProductId }).eq('productid', productId)
      await supabase.from('promotions').update({ ProductID: newProductId }).eq('ProductID', productId)
      await supabase.from('promotions').update({ GetProductID: newProductId }).eq('GetProductID', productId)
      await supabase.from('po_items').update({ productid: newProductId }).eq('productid', productId)
      await supabase.from('stock_logs').update({ productid: newProductId }).eq('productid', productId)
    }

    const updated = await this.getProduct(isChangingId ? newProductId : productId)
    if (!updated) {
      throw new Error('ไม่พบสินค้าหลังอัปเดต หรือไม่มีสิทธิ์อ่าน')
    }
    return updated
  },

  // Add product
  async addProduct(productData) {
    const productId = (productData.id || '').trim() || `PROD_${Date.now()}`
    const exists = await this.isProductIdExists(productId)
    if (exists) {
      throw new Error(`รหัสสินค้า "${productId}" มีอยู่แล้วในระบบ กรุณาใช้รหัสอื่น`)
    }
    const priceNum = requireDbNumber(productData.price, 'ราคา')
    const orderStep = Math.max(1, parseInt(productData.orderStep, 10) || 1)
    const insertData = {
      ProductID: productId,
      ProductName: productData.name,
      Price: priceNum,
      Stock: toDbNumber(productData.stock, 0),
      Image: productData.image || '',
      Category: productData.category || '',
      Detail: productData.detail || '',
      Supplier: productData.supplier || '',
      Unit: productData.unit || 'ชิ้น',
      Weight: toDbNumber(productData.weight, 0),
      MinStock: Math.max(0, toDbNumber(productData.minStock, 5)),
      FranchisePrice: toDbNumber(productData.franchisePrice, priceNum),
      OrderStep: orderStep,
      VisibleOnHome: productData.visibleOnHome !== false,
      SaleToFranchise: productData.saleToFranchise !== false,
      SaleToRegular: productData.saleToRegular !== false,
      SaleRestrictedToUsers: productData.saleRestrictedToUsers === true,
      AllowedViewerEmails: serializeAllowedViewerEmailsToJson(
        productData.allowedViewerEmailsText != null ? productData.allowedViewerEmailsText : ''
      ),
      IsBundle: productData.isBundle === true,
      BundleFlexible: productData.isBundle === true && productData.bundleFlexible === true,
      BundleComponentSumEqualsPrimary:
        productData.isBundle === true &&
        productData.bundleFlexible === true &&
        productData.bundleComponentSumEqualsPrimary === true,
      BundlePrimaryProductId:
        productData.isBundle === true &&
        productData.bundleFlexible === true &&
        productData.bundlePrimaryProductId
          ? String(productData.bundlePrimaryProductId).trim()
          : null,
      ProductOptions: sanitizeProductOptionsForDb(productData.productOptions),
      BundleLines: sanitizeBundleLinesForDb(
        productData.bundleLines,
        productData.isBundle === true && productData.bundleFlexible === true
      ),
      PriceTiers: sanitizePriceTiersForDb(productData.priceTiers ?? [], orderStep)
    }
    
    // Add Cost if provided
    if (productData.cost !== undefined && productData.cost !== null && productData.cost !== '') {
      insertData.Cost = requireDbNumber(productData.cost, 'ต้นทุน')
    }

    const { error } = await supabase
      .from('products')
      .insert(insertData)

    if (error) {
      throw new Error(formatSupabaseError(error))
    }

    const created = await this.getProduct(insertData.ProductID)
    if (!created) {
      throw new Error('สร้างสินค้าแล้วแต่ไม่สามารถอ่านข้อมูลได้ (ตรวจสอบ RLS หรือสิทธิ์ตาราง products)')
    }
    return created
  },

  // Delete product
  async deleteProduct(productId) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('ProductID', productId)

      if (error) {
        throw new Error(error.message)
      }

      return { success: true }
    } catch (error) {
      console.error('Error deleting product:', error)
      throw new Error(error.message || 'ไม่สามารถลบสินค้าได้')
    }
  },

  // Update stock with optional logging
  async updateStock(productId, newStock, userEmail = 'system', logType = 'EDIT', logNote = 'แก้ไขสต็อก') {
    // Get current product info for logging
    const { data: currentList, error: fetchError } = await supabase
      .from('products')
      .select('ProductName, Stock, Unit')
      .eq('ProductID', productId)
      .limit(1)

    if (fetchError) {
      throw new Error(fetchError.message)
    }
    const currentProduct = Array.isArray(currentList) && currentList.length > 0 ? currentList[0] : null
    if (!currentProduct) {
      throw new Error('Product not found for stock update.')
    }

    const oldStock = Number(currentProduct.Stock) || 0
    const quantityChange = newStock - oldStock

    console.log('[productService] Preparing to update stock:', {
      productId,
      productName: currentProduct.ProductName,
      oldStock,
      newStock,
      quantityChange,
      logType,
      logNote
    })

    // Determine log type and quantity based on stock change direction
    // If stock decreased (quantityChange < 0), it's OUT (sale/withdrawal)
    // If stock increased (quantityChange > 0), it's IN (restock/receive)
    let finalLogType = logType
    let finalQuantity = quantityChange
    
    // Auto-detect type if not explicitly set
    if (logType === 'EDIT' || !logType) {
      if (quantityChange < 0) {
        finalLogType = 'OUT'
        finalQuantity = Math.abs(quantityChange) // Store as positive, display as negative
      } else if (quantityChange > 0) {
        finalLogType = 'IN'
        finalQuantity = quantityChange
      } else {
        finalLogType = 'EDIT'
        finalQuantity = 0
      }
    } else if (logType === 'OUT' && quantityChange < 0) {
      // If explicitly OUT and quantityChange is negative, use absolute value
      finalQuantity = Math.abs(quantityChange)
    }

    // Update stock (ไม่ใช้ .select() เพื่อหลีกเลี่ยง 406 เมื่อ RLS ไม่ให้คืนแถว)
    const { error } = await supabase
      .from('products')
      .update({ Stock: newStock })
      .eq('ProductID', productId)

    if (error) {
      console.error('[productService] ✗ Error updating products table:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        productId,
        newStock
      })
      throw new Error(`ไม่สามารถอัปเดตสต็อก: ${error.message}`)
    }

    console.log('[productService] ✓ Stock updated in products table:', { productId, oldStock, newStock })

    // Log stock movement if quantity changed
    if (quantityChange !== 0) {
      try {
        const logData = {
          productid: productId,
          productname: currentProduct.ProductName,
          type: finalLogType,
          quantity: finalQuantity, // Store as positive for OUT, will be displayed as negative
          balance: newStock,
          note: logNote || 'แก้ไขสต็อก',
          useremail: userEmail || 'system'
        }
        
        console.log('[productService] Attempting to log stock movement:', logData)
        
        const { data: insertedData, error: logError } = await supabase
          .from('stock_logs')
          .insert(logData)
          .select()
        
        if (logError) {
          console.error('[productService] ✗ Error logging stock movement:', {
            error: logError,
            code: logError.code,
            message: logError.message,
            details: logError.details,
            hint: logError.hint,
            logData
          })
          // Don't throw error, just log it - stock update should still succeed
        } else {
          console.log('[productService] ✓ Stock log saved successfully:', insertedData)
        }
      } catch (logError) {
        console.error('[productService] ✗ Exception logging stock movement:', {
          error: logError,
          message: logError.message,
          stack: logError.stack
        })
        // Don't throw error, just log it
      }
    } else {
      console.log('[productService] No stock change (quantityChange = 0), skipping log')
    }

    // Dispatch event to notify stock update
    window.dispatchEvent(new CustomEvent('stockUpdated', {
      detail: { productId, newStock }
    }))

    const updated = await this.getProduct(productId)
    return updated || { id: productId, name: currentProduct?.ProductName, stock: newStock }
  }
}
