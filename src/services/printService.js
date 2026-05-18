import { escapeHtml } from '../utils/helpers'
import { resolveShippingAddressForPrint } from '../utils/orderAddressUtils'
import { freeQtyForLineItem, formatOrderItemLinesForDisplay } from '../utils/orderBundleLineUtils'
const escapeHtmlMultiline = (text) => escapeHtml(text || '').replace(/\n/g, '<br>')
import { LOGO_URL } from '../utils/constants'
import { getShopInfo, getVatRate, calcVatFromTotal } from './shopSettingsService'
import { supabase } from '../utils/supabase'

const PRINT_LINE_POLICY_DEFAULTS = {
  receipt: { hideBundleIds: true },
  taxInvoice: { hideBundleIds: true },
  supplierPickList: { hideBundleIds: true }
}

const resolveLinePolicy = (docType, overridePolicy) => {
  const base = PRINT_LINE_POLICY_DEFAULTS[docType] || { hideBundleIds: true }
  return {
    ...base,
    ...(overridePolicy && typeof overridePolicy === 'object' ? overridePolicy : {})
  }
}

const lineNameHtmlByPolicy = (rawName, policy) => {
  const hideBundleIds = policy?.hideBundleIds !== false
  const lines = formatOrderItemLinesForDisplay(rawName, { hideBundleIds })
  if (!lines.length) return '-'
  return escapeHtmlMultiline(lines.join('\n'))
}

// Helper function to open print window
const openPrintWindow = (content) => {
  const printWindow = window.open('', '_blank')
  printWindow.document.write(content)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 250)
}

// Helper function to format date
const formatOrderDate = (dateStr) => {
  if (!dateStr) return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  
  try {
    // First, try to parse as ISO date string (from Supabase Timestamp)
    if (typeof dateStr === 'string' && dateStr.includes('T')) {
      const dateObj = new Date(dateStr)
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
      }
    }
    
    // Try parsing as Date object
    if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
      return dateStr.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    }
    
    // Try parsing Thai date format (dd/mm/yyyy)
    const dateMatch = dateStr.toString().trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (dateMatch) {
      const day = parseInt(dateMatch[1])
      const month = parseInt(dateMatch[2]) - 1
      const year = parseInt(dateMatch[3])
      const ceYear = year - 543 // Convert BE to CE
      const dateObj = new Date(ceYear, month, day)
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
      }
    }
  } catch (e) {
    console.error('Error formatting date:', e, dateStr)
  }
  
  // Fallback to current date only if all parsing fails
  return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Helper function to fetch customer phone number
const fetchCustomerPhone = async (userEmail) => {
  if (!userEmail) {
    console.log('No userEmail provided to fetchCustomerPhone')
    return ''
  }
  try {
    console.log('Fetching phone for email:', userEmail)
    
    // Based on Supabase table structure, use PascalCase: Email and Phone
    // Try Email (PascalCase) first as seen in Login.jsx
    let { data: userData, error: userError } = await supabase
      .from('users')
      .select('Phone')
      .eq('Email', userEmail)
      .maybeSingle()
    
    console.log('Query with Email (PascalCase):', { userData, userError, hasData: !!userData })
    
    // If not found or error, try lowercase email column (but keep Phone with capital P)
    if (userError || !userData) {
      console.log('Trying with lowercase email column...')
      const result = await supabase
        .from('users')
        .select('Phone')
        .eq('email', userEmail)
        .maybeSingle()
      userData = result.data
      userError = result.error
      console.log('Query with email (lowercase):', { userData, userError, hasData: !!userData })
    }
    
    if (!userError && userData) {
      // Try all possible phone column names
      const phone = userData.Phone || userData.phone || userData.PhoneNumber || userData.phonenumber || ''
      if (phone && phone !== 'NULL' && phone.trim() !== '') {
        console.log('Successfully fetched customer phone:', phone, 'for email:', userEmail)
        return phone
      } else {
        console.warn('Phone found but is empty or NULL:', phone)
      }
    } else {
      console.warn('Error or no data found:', { userError, hasData: !!userData })
      if (userError) {
        console.error('Supabase error details:', userError)
      }
    }
  } catch (error) {
    console.error('Error fetching customer phone:', error)
  }
  return ''
}

export const printService = {
  // Print Shipping Label (ใบปะหน้ากล่องพัสดุ)
  async printShippingLabel(order) {
    const shop = await getShopInfo()
    const customerName = order.Username || order.UserEmail || order.User || '-'
    const userEmail = order.UserEmail || order.User || ''
    const customerPhone = await fetchCustomerPhone(userEmail)
    const customerAddressDisplay = await resolveShippingAddressForPrint(order)
    const totalItems = (order.Items || []).reduce((sum, item) => sum + (item.qty || 0), 0)
    
    const fullAddress = shop.address.split('\n')[0] || ''
    const addressParts = fullAddress.split('เขตบางซื่อ')
    const addressLine1 = addressParts[0] ? addressParts[0].trim() : ''
    const addressLine2 = addressParts[1] ? ('เขตบางซื่อ' + addressParts[1]).trim() : ''
    const shopPhone = shop.address.split('\n')[1]?.replace('โทร. ', '') || shop.phone || ''
    
    const trackingHtml = order.TrackingNumber ? `
      <div class="tracking-box">
        <div class="tracking-label">🚚 เลขพัสดุ</div>
        <div class="tracking-number">${escapeHtml(order.TrackingNumber)}</div>
      </div>
    ` : ''
    
    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shipping Label</title>
      <style>
        @page { 
          size: 100mm 150mm; 
          margin: 6mm 4mm; 
        }
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body { 
          font-family: 'Sarabun', 'Arial', sans-serif; 
          padding: 0; 
          margin: 0; 
          line-height: 1.5; 
          color: #000; 
          font-size: 10pt;
          background: white;
        }
        .container {
          width: 100%;
          max-width: 92mm;
          margin: 0 auto;
        }
        .header-section {
          padding: 6px 0;
          margin-bottom: 12px;
          text-align: center;
        }
        .company-name { 
          font-size: 11pt; 
          font-weight: bold; 
          text-align: center; 
          margin-bottom: 6px;
          line-height: 1.3;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }
        .shop-address { 
          font-size: 8pt; 
          text-align: center; 
          color: #333;
          line-height: 1.4;
          margin-bottom: 3px;
        }
        .shop-phone { 
          font-size: 8pt; 
          text-align: center; 
          color: #333;
          line-height: 1.4;
        }
        .order-section {
          padding: 8px 0;
          margin: 10px 0;
          text-align: center;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
        }
        .order-id { 
          font-size: 11pt; 
          font-weight: bold; 
          color: #000;
          letter-spacing: 1px;
          font-family: 'Arial', monospace;
        }
        .customer-box {
          border: 1.5px solid #000;
          padding: 8px 6px;
          margin: 10px 0;
          background: #fff;
        }
        .customer-label { 
          font-size: 9pt; 
          font-weight: bold; 
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #000;
          padding-bottom: 3px;
        }
        .customer-name { 
          font-size: 11pt; 
          font-weight: bold; 
          margin-bottom: 4px;
          margin-top: 4px;
        }
        .customer-address { 
          font-size: 9pt; 
          line-height: 1.5;
          word-break: break-word;
        }
        .info-box {
          border: 1px dashed #666;
          padding: 6px;
          margin: 8px 0;
          text-align: center;
          background: #f9f9f9;
        }
        .items-count { 
          font-size: 9pt; 
          font-weight: bold;
        }
        .tracking-box {
          padding: 6px;
          margin: 8px 0;
          text-align: center;
          background: #fff;
          border: 1px dashed #666;
        }
        .tracking-label {
          font-size: 7pt;
          font-weight: bold;
          margin-bottom: 3px;
          text-transform: uppercase;
        }
        .tracking-number {
          font-size: 11pt;
          font-weight: bold;
          font-family: 'Arial', monospace;
          letter-spacing: 1px;
        }
        @media print {
          body { margin: 0; padding: 0; }
          .container { page-break-inside: avoid; }
        }
      </style>
    </head><body>
      <div class="container">
        <div class="header-section">
          <div class="company-name">${escapeHtml(shop.name)}</div>
          <div class="shop-address">${escapeHtml(addressLine1)}</div>
          <div class="shop-address">${escapeHtml(addressLine2)}</div>
          <div class="shop-phone">โทร. ${escapeHtml(shopPhone)}</div>
        </div>
        
        <div class="order-section">
          <div class="order-id">${escapeHtml(order.ID || order.OrderID || '')}</div>
        </div>
        
        <div class="customer-box">
          <div class="customer-label">📦 ส่งถึง</div>
          <div class="customer-name">${escapeHtml(customerName)}</div>
          <div class="customer-address">${escapeHtmlMultiline(customerAddressDisplay)}</div>
          ${customerPhone ? `<div class="customer-address" style="margin-top: 4px;"><strong>โทร.</strong> ${escapeHtml(customerPhone)}</div>` : ''}
        </div>
        
        <div class="info-box">
          <div class="items-count">จำนวนรายการ: ${totalItems} รายการ</div>
        </div>
        
        ${trackingHtml}
      </div>
    </body></html>`
    
    openPrintWindow(content)
  },

  // Print Receipt (ใบเสร็จรับเงิน)
  async printReceipt(order, options = {}) {
    const shop = await getShopInfo()
    const customerName = order.Username || order.UserEmail || order.User || '-'
    const userEmail = order.UserEmail || order.User || ''
    const customerPhone = await fetchCustomerPhone(userEmail)
    const customerAddressDisplay = await resolveShippingAddressForPrint(order)
    const items = order.Items || []
    const discountInfo = String(order.DiscountInfo || order.discountInfo || '')

    const freeItemsMatch = discountInfo.match(/FreeItems:\s*([^|]+)/i)
    const freeItemsMap = new Map()
    if (freeItemsMatch) {
      const freeItemsStr = freeItemsMatch[1].trim()
      freeItemsStr.split(',').forEach((itemStr) => {
        const match = itemStr.trim().match(/^(.+?):(\d+)$/)
        if (match) {
          const itemName = match[1].trim()
          const freeQty = parseInt(match[2], 10)
          freeItemsMap.set(itemName, freeQty)
        }
      })
    }

    const linePolicy = resolveLinePolicy('receipt', options?.linePolicy)
    const itemsHtml = items
      .map((it, i) => {
        const nm = it.name || ''
        const fq = freeQtyForLineItem(freeItemsMap, nm)
        const totalQty = Number(it.qty || 0)
        const paidQty = Math.max(0, totalQty - fq)
        const lineAmt = Number(it.price || 0) * paidQty
        return `
      <tr>
        <td style="text-align:center;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${i + 1}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${lineNameHtmlByPolicy(nm, linePolicy)}</td>
        <td style="text-align:center;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${totalQty}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${Number(it.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${lineAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      </tr>
    `
      })
      .join('')

    // Parse discount info to separate coupon discount and promotion discount
    let couponDiscount = 0
    let promotionDiscount = 0

    // Calculate subtotal excluding free items
    const subtotal = items.reduce((s, i) => {
      const fq = freeQtyForLineItem(freeItemsMap, i.name || '')
      const paidQty = Math.max(0, (Number(i.qty) || 0) - fq)
      return s + (Number(i.price || 0) * paidQty)
    }, 0)
    
    // Check for coupon code (format: "Code: XXX (-XXB)")
    const couponMatch = discountInfo.match(/Code:.*?\(-(\d+(?:\.\d+)?)B?\)/i)
    if (couponMatch) {
      couponDiscount = parseFloat(couponMatch[1])
    }
    
    // Check for promotion (format: "Promotion: -XXB")
    const promotionMatch = discountInfo.match(/Promotion:\s*-?(\d+(?:\.\d+)?)B?/i)
    if (promotionMatch) {
      promotionDiscount = parseFloat(promotionMatch[1])
    }
    
    // If no specific format found, try to parse from DiscountInfo or Discount column
    if (couponDiscount === 0 && promotionDiscount === 0) {
      const match = discountInfo.match(/-(\d+(?:\.\d+)?)B/)
      if (match) {
        // If DiscountInfo contains "Code:" but no amount, or if it's just a number
        if (discountInfo.includes('Code:')) {
          couponDiscount = parseFloat(match[1])
        } else {
          promotionDiscount = parseFloat(match[1])
        }
      } else {
        // Try to get discount from Amount in DiscountInfo
        const amountMatch = discountInfo.match(/Amount:\s*(\d+(?:\.\d+)?)/i)
        if (amountMatch) {
          if (discountInfo.includes('Code:')) {
            couponDiscount = parseFloat(amountMatch[1])
          } else {
            promotionDiscount = parseFloat(amountMatch[1])
          }
        } else {
          // Fallback to Discount column - check if DiscountInfo has "Code:" to determine type
          const totalDiscount = Number(order.Discount || order.discount || 0)
          if (discountInfo.includes('Code:')) {
            couponDiscount = totalDiscount
          } else if (totalDiscount > 0) {
            promotionDiscount = totalDiscount
          }
        }
      }
    }
    
    // Calculate free items value (มูลค่าสินค้าแถม)
    let freeItemsValue = 0
    if (freeItemsMap.size > 0) {
      items.forEach((item) => {
        const freeQty = freeQtyForLineItem(freeItemsMap, item.name || '')
        if (freeQty > 0) {
          freeItemsValue += Number(item.price || 0) * freeQty
        }
      })
    }
    
    const totalDiscount = couponDiscount + promotionDiscount
    // Try multiple column name variations including 'Shipping Cost' (with space)
    const shipping = Number(
      order['Shipping Cost'] || 
      order.ShippingCost || 
      order.Shipping || 
      order.shippingCost || 
      order.shipping || 
      0
    )
    console.log('[printService] Receipt shipping cost:', {
      orderId: order.ID || order.OrderID,
      'Shipping Cost': order['Shipping Cost'],
      ShippingCost: order.ShippingCost,
      Shipping: order.Shipping,
      shippingCost: order.shippingCost,
      shipping: order.shipping,
      finalShipping: shipping,
      allKeys: Object.keys(order)
    })
    const grandTotal = subtotal - totalDiscount + shipping
    
    // Use Timestamp (order date) instead of current date
    const orderDateStr = formatOrderDate(order.Timestamp || order.CreatedAt || order.date)
    
    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: 'Sarabun', sans-serif; padding: 0; line-height: 1.3; color: #333; font-size: 8pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th { background: #1f2937 !important; color: white !important; border: 1px solid #1f2937; padding: 6px 4px; font-size: 8pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 2px solid #1f2937; padding-bottom: 10px; }
        .box { border: 1px solid #ccc; padding: 10px; margin-bottom: 15px; border-radius: 4px; font-size: 8pt; }
        td { font-size: 8pt; padding: 6px 4px; }
        @media print {
          body { margin: 0; padding: 0; }
        }
      </style>
    </head><body>
      <div class="header">
        <div style="width: 60%; text-align: left;">
          <h2 style="margin: 0 0 4px 0; font-size: 12pt; font-weight: bold; color: #1f2937;">${escapeHtml(shop.name)}</h2>
          <div style="font-size: 7pt; color: #333; line-height: 1.4; margin-bottom: 2px;">${escapeHtml(shop.address).replace(/\n/g, '<br>')}</div>
          <div style="font-size: 7pt; color: #333; line-height: 1.4;">
            <strong>โทร.</strong> ${escapeHtml(shop.phone || '')}
          </div>
        </div>
        <div style="width: 40%; text-align: right;">
          <h1 style="margin: 0; font-size: 14pt; font-weight: bold; color: #1f2937;">ใบเสร็จรับเงิน</h1>
          <p style="margin: 4px 0; font-size: 7pt; color: #666;">(Receipt)</p>
          <div style="border: 1px solid #ddd; padding: 8px; border-radius: 4px; background-color: #f9fafb; display: inline-block; text-align: right; margin-top: 8px;">
            <div style="font-size: 7pt;"><strong>เลขที่:</strong> ${escapeHtml(order.ID || order.OrderID || '')}</div>
            <div style="font-size: 7pt;"><strong>วันที่:</strong> ${orderDateStr}</div>
          </div>
        </div>
      </div>
      <div class="box" style="background-color: #f9fafb;">
        <h3 style="margin: 0 0 8px 0; font-size: 8pt; font-weight: bold; color: #1f2937; border-bottom: 1px solid #eee; padding-bottom: 4px;">ลูกค้า (Customer)</h3>
        <div>
          <div style="font-weight: bold; margin-bottom: 2px; font-size: 8pt;">${escapeHtml(customerName)}</div>
          <div style="margin-bottom: 2px; font-size: 7pt;">${escapeHtmlMultiline(customerAddressDisplay)}</div>
          ${customerPhone ? `<div style="margin-top: 2px; font-size: 7pt;"><strong>โทร.</strong> ${escapeHtml(customerPhone)}</div>` : ''}
        </div>
      </div>
      <table style="width: 100%; border: 1px solid #ddd;">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 40%;">รายการ</th>
            <th style="width: 10%; text-align: center;">จำนวน</th>
            <th style="width: 20%; text-align: right;">ราคา/หน่วย</th>
            <th style="width: 20%; text-align: right;">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          ${couponDiscount > 0 ? `<tr><td colspan="4" style="text-align: right; color: #dc2626; padding: 6px 4px;">ส่วนลด (โค้ดส่วนลด)</td><td style="text-align: right; color: #dc2626; padding: 6px 4px;">-${couponDiscount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>` : ''}
          ${(promotionDiscount > 0 || freeItemsValue > 0) ? `<tr><td colspan="4" style="text-align: right; color: #dc2626; padding: 6px 4px;">โปรโมชั่น${promotionDiscount > 0 && freeItemsValue > 0 ? ' (ส่วนลด + แถม)' : promotionDiscount > 0 ? '' : ' (แถมสินค้า)'}</td><td style="text-align: right; color: #dc2626; padding: 6px 4px;">-${(promotionDiscount + freeItemsValue).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>` : ''}
          <tr><td colspan="4" style="text-align: right; font-weight: bold; padding: 6px 4px;">รวมเงิน</td><td style="text-align: right; padding: 6px 4px;">${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
          <tr><td colspan="4" style="text-align: right; padding: 6px 4px;">ค่าขนส่ง</td><td style="text-align: right; padding: 6px 4px;">${shipping.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
          <tr style="background-color: #1f2937 !important; color: white !important; font-weight: bold; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <td colspan="4" style="text-align: right; padding: 8px 4px;">ยอดสุทธิ</td>
            <td style="text-align: right; padding: 8px 4px;">${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top: 30px; text-align: center; font-size: 8pt; color: #666;">
        <p>ขอบคุณที่ใช้บริการ</p>
      </div>
    </body></html>`
    
    openPrintWindow(content)
  },

  /**
   * รายการสินค้าสำหรับซัพพลายเออร์ที่ไม่ใช่ส่วนกลาง — แสดงรหัส, ชื่อ, ราคา, จำนวน (ไม่ผ่านขั้นแพ็ก; ไม่แสดง BUNDLE_IDS ในชื่อ)
   */
  async printSupplierPickList(order, options = {}) {
    const shop = await getShopInfo()
    const orderId = order.ID || order.OrderID || ''
    const customerName = order.Username || order.UserEmail || order.User || '-'
    const items = order.Items || []
    const discountInfo = String(order.DiscountInfo || order.discountInfo || '')
    const freeItemsMatch = discountInfo.match(/FreeItems:\s*([^|]+)/i)
    const freeItemsMap = new Map()
    if (freeItemsMatch) {
      freeItemsMatch[1].trim().split(',').forEach((itemStr) => {
        const match = itemStr.trim().match(/^(.+?):(\d+)$/)
        if (match) {
          freeItemsMap.set(match[1].trim(), parseInt(match[2], 10))
        }
      })
    }
    const orderDateStr = formatOrderDate(order.Timestamp || order.CreatedAt || order.date)
    const linePolicy = resolveLinePolicy('supplierPickList', options?.linePolicy)
    const rows = items
      .map((it, idx) => {
        const name = it.name || '-'
        const pid = (it.id || it.productId || '').toString() || '-'
        const freeQty = freeQtyForLineItem(freeItemsMap, name)
        const qty = Math.max(0, Number(it.qty || 0) - freeQty)
        const price = Number(it.price || 0)
        const line = price * qty
        return `<tr>
          <td style="text-align:center;border:1px solid #ccc;padding:6px;">${idx + 1}</td>
          <td style="border:1px solid #ccc;padding:6px;font-family:monospace;font-size:9pt;">${escapeHtml(pid)}</td>
          <td style="border:1px solid #ccc;padding:6px;">${lineNameHtmlByPolicy(name, linePolicy)}</td>
          <td style="text-align:right;border:1px solid #ccc;padding:6px;">${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td style="text-align:center;border:1px solid #ccc;padding:6px;">${qty}</td>
          <td style="text-align:right;border:1px solid #ccc;padding:6px;">${line.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>`
      })
      .join('')
    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>รายการสินค้า ${escapeHtml(orderId)}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: 'Sarabun', sans-serif; font-size: 10pt; color: #111; }
        h1 { font-size: 14pt; margin: 0 0 8px 0; }
        .meta { font-size: 9pt; color: #444; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1f2937; color: #fff; padding: 8px 6px; text-align: left; font-size: 9pt; }
        th:nth-child(1), th:nth-child(5) { text-align: center; }
        th:nth-child(4), th:nth-child(6) { text-align: right; }
      </style></head><body>
      <h1>รายการสินค้า (ซัพพลายภายนอก)</h1>
      <div class="meta">
        <div><strong>ร้าน:</strong> ${escapeHtml(shop.name || '')}</div>
        <div><strong>เลขที่ออเดอร์:</strong> ${escapeHtml(orderId)} &nbsp;|&nbsp; <strong>วันที่:</strong> ${orderDateStr}</div>
        <div><strong>ลูกค้า:</strong> ${escapeHtml(customerName)}</div>
      </div>
      <table>
        <thead><tr>
          <th style="width:4%;">#</th>
          <th style="width:18%;">รหัสสินค้า</th>
          <th style="width:36%;">ชื่อสินค้า</th>
          <th style="width:14%;">ราคา/หน่วย</th>
          <th style="width:10%;">จำนวน</th>
          <th style="width:18%;">รวม</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;font-size:9pt;color:#666;">ใช้สำหรับสั่ง/จัดส่งโดยซัพพลายเออร์ — ไม่ผ่านขั้นจัดเตรียมแพ็กส่วนกลาง</p>
    </body></html>`
    openPrintWindow(content)
  },

  // Print Tax Invoice (ใบกำกับภาษี)
  async printTaxInvoice(order, taxData, options = {}) {
    const [shop, vatRate] = await Promise.all([getShopInfo(), getVatRate()])
    const { taxName, taxId, taxAddress, items, customerPhone } = taxData
    const userEmail = order.UserEmail || order.User || ''
    // Use customerPhone from taxData if available, otherwise fetch from users table
    let customerPhoneNumber = customerPhone || ''
    if (!customerPhoneNumber) {
      customerPhoneNumber = await fetchCustomerPhone(userEmail)
    }
    if (!customerPhoneNumber) {
      customerPhoneNumber = order.Phone || order.phone || '-'
    }
    
    // Parse discount info to separate coupon discount and promotion discount
    let couponDiscount = 0
    let promotionDiscount = 0
    let freeItemsValue = 0
    const discountInfo = String(order.DiscountInfo || order.discountInfo || "")
    
    // Parse free items from DiscountInfo to calculate subtotal correctly
    const freeItemsMatch = discountInfo.match(/FreeItems:\s*([^|]+)/i)
    const freeItemsMap = new Map()
    if (freeItemsMatch) {
      const freeItemsStr = freeItemsMatch[1].trim()
      freeItemsStr.split(',').forEach(itemStr => {
        const match = itemStr.trim().match(/^(.+?):(\d+)$/)
        if (match) {
          const itemName = match[1].trim()
          const freeQty = parseInt(match[2])
          freeItemsMap.set(itemName, freeQty)
        }
      })
    }
    
    // Calculate subtotal excluding free items
    const subtotal = items.reduce((sum, item) => {
      const freeQty = freeQtyForLineItem(freeItemsMap, item.name || '')
      const paidQty = Math.max(0, (Number(item.qty) || 0) - freeQty)
      return sum + (Number(item.price || 0) * paidQty)
    }, 0)
    
    // Get discount from taxData first (if available), then try to get from order
    // Use separate fields from taxData if available to avoid duplication
    if (taxData.couponDiscount !== undefined || taxData.promotionDiscount !== undefined || taxData.freeItemsValue !== undefined) {
      // Use separate discount fields from taxData
      couponDiscount = Number(taxData.couponDiscount || 0)
      promotionDiscount = Number(taxData.promotionDiscount || 0)
      freeItemsValue = Number(taxData.freeItemsValue || 0)
    } else {
      // Parse from DiscountInfo if taxData doesn't have separate fields
      // Check for coupon code (format: "Code: XXX (-XXB)")
      const couponMatch = discountInfo.match(/Code:.*?\(-(\d+(?:\.\d+)?)B?\)/i)
      if (couponMatch) {
        couponDiscount = parseFloat(couponMatch[1])
      }
      
      // Check for promotion (format: "Promotion: -XXB")
      const promotionMatch = discountInfo.match(/Promotion:\s*-?(\d+(?:\.\d+)?)B?/i)
      if (promotionMatch) {
        promotionDiscount = parseFloat(promotionMatch[1])
      }
      
      // If no specific format found, try to parse from DiscountInfo or Discount column
      if (couponDiscount === 0 && promotionDiscount === 0) {
        const match = discountInfo.match(/-(\d+(?:\.\d+)?)B/)
        if (match) {
          // If DiscountInfo contains "Code:" but no amount, or if it's just a number
          if (discountInfo.includes('Code:')) {
            couponDiscount = parseFloat(match[1])
          } else {
            promotionDiscount = parseFloat(match[1])
          }
        } else {
          // Try to get discount from Amount in DiscountInfo
          const amountMatch = discountInfo.match(/Amount:\s*(\d+(?:\.\d+)?)/i)
          if (amountMatch) {
            if (discountInfo.includes('Code:')) {
              couponDiscount = parseFloat(amountMatch[1])
            } else {
              promotionDiscount = parseFloat(amountMatch[1])
            }
          } else {
            // Fallback to Discount column - check if DiscountInfo has "Code:" to determine type
            const totalDiscount = Number(order.Discount || order.discount || order.discountAmount || 0)
            if (discountInfo.includes('Code:')) {
              couponDiscount = totalDiscount
            } else if (totalDiscount > 0) {
              promotionDiscount = totalDiscount
            }
          }
        }
      }
      
      // Calculate free items value (มูลค่าสินค้าแถม) if not already set
      if (freeItemsValue === 0 && freeItemsMap.size > 0) {
        items.forEach((item) => {
          const freeQty = freeQtyForLineItem(freeItemsMap, item.name || '')
          if (freeQty > 0) {
            freeItemsValue += Number(item.price || 0) * freeQty
          }
        })
      }
    }
    
    // Calculate free items value (มูลค่าสินค้าแถม) if not already set from taxData
    // This handles the case where taxData doesn't have separate discount fields
    if (freeItemsValue === 0 && freeItemsMap.size > 0) {
      items.forEach((item) => {
        const freeQty = freeQtyForLineItem(freeItemsMap, item.name || '')
        if (freeQty > 0) {
          freeItemsValue += Number(item.price || 0) * freeQty
        }
      })
    }
    
    const discountAmount = couponDiscount + promotionDiscount
    // Try multiple column name variations including 'Shipping Cost' (with space)
    const shipping = Number(
      taxData.shipping || 
      order['Shipping Cost'] || 
      order.ShippingCost || 
      order.shippingCost || 
      order.Shipping || 
      order.shipping || 
      0
    )
    console.log('[printService] Tax Invoice shipping cost:', {
      orderId: order.ID || order.OrderID,
      taxDataShipping: taxData.shipping,
      'Shipping Cost': order['Shipping Cost'],
      ShippingCost: order.ShippingCost,
      Shipping: order.Shipping,
      shippingCost: order.shippingCost,
      shipping: order.shipping,
      finalShipping: shipping,
      allKeys: Object.keys(order)
    })
    const grandTotal = subtotal - discountAmount + shipping
    const { vat, preVat } = calcVatFromTotal(grandTotal, vatRate)

    const linePolicy = resolveLinePolicy('taxInvoice', options?.linePolicy)
    const itemsHtml = items
      .map((item, idx) => {
        const nm = item.name || ''
        const fq = freeQtyForLineItem(freeItemsMap, nm)
        const totalQty = Number(item.qty || 0)
        const paidQty = Math.max(0, totalQty - fq)
        const lineAmt = Number(item.price || 0) * paidQty
        return `
      <tr>
        <td style="text-align:center;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${idx + 1}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${lineNameHtmlByPolicy(nm, linePolicy)}</td>
        <td style="text-align:center;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${totalQty}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${Number(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${lineAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      </tr>
    `
      })
      .join('')

    // Use Timestamp (order date) instead of invoiceDate or current date
    const orderDateStr = formatOrderDate(order.Timestamp || order.CreatedAt || taxData.invoiceDate || order.date)
    const orderId = order.ID || order.OrderID || order.id || ''

    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tax Invoice</title>
      <style>
        @page{size:A4;margin:12mm}
        body{font-family:'Sarabun',sans-serif;padding:0;line-height:1.3;color:#333;font-size:8pt}
        table{width:100%;border-collapse:collapse;margin-bottom:10px}
        th{background:#047857 !important;color:white !important;border:1px solid #047857;padding:6px 4px;font-size:8pt; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:15px;border-bottom:2px solid #047857;padding-bottom:10px}
        .box{border:1px solid #ccc;padding:10px;margin-bottom:15px;border-radius:4px;font-size:8pt}
        td{font-size:8pt;padding:6px 4px}
        @media print {
          img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .signature-container { page-break-inside: avoid; }
          body { margin: 0; padding: 0; }
        }
      </style>
    </head><body>
      <!-- Logo and Header Section -->
      <div style="margin-bottom:15px; border-bottom:2px solid #047857; padding-bottom:10px;">
        <!-- Single Row: Logo (Left) | Company Info (Center-Left) | Invoice Title (Right) -->
        <div style="display:flex; align-items:flex-start; gap:15px;">
          <!-- Left: Logo -->
          <div style="flex-shrink:0;">
            <img src="${LOGO_URL}" style="max-width:160px; max-height:150px; object-fit:contain;" onerror="this.style.display='none';" />
          </div>
          <!-- Center-Left: Company Info (ติดกับโลโก้) -->
          <div style="flex:1;">
            <h2 style="margin:0 0 4px 0; font-size:9pt; font-weight:bold; color:#047857;">${escapeHtml(shop.name)}</h2>
            <div style="font-size:7pt; color:#333; line-height:1.4; margin-bottom:2px;">
              <strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(shop.taxId)}
            </div>
            <div style="font-size:7pt; color:#333; line-height:1.4; margin-bottom:2px;">
              ${escapeHtml(shop.address).replace(/\n/g, '<br>')}
            </div>
            <div style="font-size:7pt; color:#333; margin-top:2px;">
              <strong>โทร.</strong> ${escapeHtml(shop.phone || '')}
            </div>
          </div>
          <!-- Right: Invoice Header -->
          <div style="flex-shrink:0; text-align:right; min-width:200px;">
            <h1 style="margin:0 0 4px 0; font-size:12pt; font-weight:bold; color:#047857; line-height:1.2;">ใบกำกับภาษี / ใบเสร็จรับเงิน</h1>
            <p style="margin:0 0 4px; font-size:7pt; color:#666;">(Tax Invoice / Receipt)</p>
            <p style="margin:0 0 8px; font-size:7pt; color:#333; font-weight:bold;">ต้นฉบับ</p>
            <div style="border:1px solid #ddd; padding:8px; border-radius:4px; background-color:#f9fafb; display:inline-block; text-align:right;">
              <div style="font-size:7pt;"><strong>เลขที่:</strong> INV-${escapeHtml(orderId)}</div>
              <div style="font-size:7pt;"><strong>วันที่:</strong> ${orderDateStr}</div>
            </div>
          </div>
        </div>
      </div>
      <!-- Customer Info Box (separate box below) -->
      <div class="box" style="background-color:#f9fafb; margin-bottom:15px;">
        <h3 style="margin:0 0 8px 0; font-size:8pt; font-weight:bold; color:#047857; border-bottom:1px solid #eee; padding-bottom:4px;">ลูกค้า (Customer)</h3>
        <div>
          <div style="font-weight:bold; margin-bottom:2px; font-size:8pt;">${escapeHtml(taxName || '-')}</div>
          <div style="font-size:7pt; color:#333; line-height:1.4; margin-bottom:2px;">
            <strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(taxId || '-')}
          </div>
          <div style="font-size:7pt; color:#333; line-height:1.4; margin-bottom:2px;">
            ${escapeHtmlMultiline(taxAddress || '-')}
          </div>
          <div style="font-size:7pt; color:#333; margin-top:2px;">
            <strong>โทร.</strong> ${escapeHtml(customerPhoneNumber)}
          </div>
        </div>
      </div>
        <table style="width:100%; border:1px solid #ddd;">
        <thead>
          <tr>
            <th style="width:5%;text-align:center">#</th>
            <th style="width:40%">รายการ</th>
            <th style="width:10%;text-align:center">จำนวน</th>
            <th style="width:20%;text-align:right">ราคา/หน่วย</th>
            <th style="width:20%;text-align:right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          ${couponDiscount > 0 ? `<tr><td colspan="4" style="text-align:right;color:#dc2626;padding:6px 4px">ส่วนลด (โค้ดส่วนลด)</td><td style="text-align:right;color:#dc2626;padding:6px 4px">-${couponDiscount.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>` : ''}
          ${(promotionDiscount > 0 || freeItemsValue > 0) ? `<tr><td colspan="4" style="text-align:right;color:#dc2626;padding:6px 4px">โปรโมชั่น${promotionDiscount > 0 && freeItemsValue > 0 ? ' (ส่วนลด + แถม)' : promotionDiscount > 0 ? '' : ' (แถมสินค้า)'}</td><td style="text-align:right;color:#dc2626;padding:6px 4px">-${(promotionDiscount + freeItemsValue).toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>` : ''}
          <tr><td colspan="4" style="text-align:right;font-weight:bold;padding:6px 4px">รวมเงิน</td><td style="text-align:right;padding:6px 4px">${subtotal.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
          <tr><td colspan="4" style="text-align:right;padding:6px 4px">ค่าขนส่ง</td><td style="text-align:right;padding:6px 4px">${shipping.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
          <tr><td colspan="4" style="text-align:right;padding:6px 4px">มูลค่าก่อนภาษี</td><td style="text-align:right;padding:6px 4px">${preVat.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
          <tr><td colspan="4" style="text-align:right;padding:6px 4px">ภาษีมูลค่าเพิ่ม ${vatRate}%</td><td style="text-align:right;padding:6px 4px">${vat.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
          <tr style="background-color:#047857 !important; color:white !important; font-weight:bold; font-size:10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <td colspan="4" style="text-align:right; padding:8px 4px;">ยอดสุทธิ</td>
            <td style="text-align:right; padding:8px 4px;">${grandTotal.toLocaleString(undefined,{minimumFractionDigits:2})} บาท</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:40px; display:flex; justify-content:flex-end; text-align:center; font-size:8pt;" class="signature-container">
        <div style="width:250px; position:relative; min-height:100px;">
          <div style="position:absolute; top:25px; left:50%; transform:translateX(-50%); width:150px; height:70px; display:flex; align-items:center; justify-content:center; z-index:2;">
            <img src="${shop.signature}" style="max-width:100%; max-height:130%; object-fit:contain; opacity:1.0; background:transparent; padding:0 8px;" onerror="this.style.display='none';" />
          </div>
          <div style="border-bottom:1px solid #ccc; height:25px; margin-bottom:4px; margin-top:60px; position:relative; z-index:1;"></div>
          <div style="position:relative; margin-top:4px; z-index:1; font-size:7pt;">
            ผู้มีอำนาจลงนาม (Authorized Signature)<br>ในนาม ${escapeHtml(shop.name)}
          </div>
        </div>
      </div>
      <div style="margin-top:30px; padding-top:15px; border-top:1px solid #ddd; text-align:center; font-size:7pt; color:#666;">
        <p style="margin:3px 0;">ใบเสร็จรับเงิน / ใบกำกับภาษีอิเล็กทรอนิกส์</p>
        <p style="margin:3px 0;">(Electronic Receipt / Tax Invoice)</p>
      </div>
    </body></html>`

    openPrintWindow(content)
  }
}
