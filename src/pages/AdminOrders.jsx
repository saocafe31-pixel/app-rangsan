import { useState, useEffect, useCallback, useMemo } from 'react'
import Swal from 'sweetalert2'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Header from '../components/common/Header'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Sidebar from '../components/common/Sidebar'
import { creditService } from '../services/creditService'
import { notificationService } from '../services/notificationService'
import { orderService, restoreStockForCancelledOrderItem } from '../services/orderService'
import { packingService } from '../services/packingService'
import { printService } from '../services/printService'
import { productService } from '../services/productService'
import { taxInvoiceService } from '../services/taxInvoiceService'
import { getVatRate, calcVatFromTotal } from '../services/shopSettingsService'
import { supabase } from '../utils/supabase'
import PackingModal from '../components/PackingModal'
import AdminCreateOrderModal from '../components/admin/AdminCreateOrderModal'
import { buildProductSupplierLookups, isOrderCentralFulfillment } from '../utils/orderSupplierUtils'
import { calculateFallbackShipping, pickShippingRateCost } from '../utils/shippingRateUtils'
import { escapeHtml } from '../utils/helpers'
import { freeQtyForLineItem, orderItemNameFirstLine, formatOrderItemLinesForDisplay, getOrderItemDisplayName } from '../utils/orderBundleLineUtils'
import { partsFromOrder, mergeAddressParts, formatAddressMultiline, shippingPartsFromUserRow } from '../utils/orderAddressUtils'

const ADMIN_ORDERS_PAGE_SIZE = 20

function parseDiscountInfoSupplierMeta(discountInfo) {
  const s = String(discountInfo || '')
  const sup = s.match(/Supplier:\s*([^|]+)/i)
  const batch = s.match(/Batch:\s*([^|]+)/i)
  return {
    supplier: sup ? sup[1].trim() : null,
    batch: batch ? batch[1].trim() : null
  }
}

export default function AdminOrders({ user }) {
  // Helper function to handle number input - removes leading zero when user starts typing
  const handleNumberInput = (value, isFloat = false) => {
    if (value === '' || value === null || value === undefined) {
      return isFloat ? 0 : 0
    }
    const stringValue = String(value)
    // If value starts with 0 and has more digits, remove leading zero
    if (stringValue.length > 1 && stringValue[0] === '0' && stringValue[1] !== '.') {
      const cleaned = stringValue.replace(/^0+/, '') || '0'
      return isFloat ? parseFloat(cleaned) || 0 : parseInt(cleaned) || 0
    }
    return isFloat ? parseFloat(stringValue) || 0 : parseInt(stringValue) || 0
  }

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasLoadedOrders, setHasLoadedOrders] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [searchOrderId, setSearchOrderId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAllDates, setShowAllDates] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [editingItems, setEditingItems] = useState([])
  const [editingShipping, setEditingShipping] = useState(0)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [selectedOrdersForShipping, setSelectedOrdersForShipping] = useState([])
  const [trackingNumbers, setTrackingNumbers] = useState({})
  const [isTaxInvoiceModalOpen, setIsTaxInvoiceModalOpen] = useState(false)
  const [editingOrderForTax, setEditingOrderForTax] = useState(null)
  const [taxInvoiceForm, setTaxInvoiceForm] = useState({
    taxName: '',
    taxId: '',
    taxAddress: '',
    customerPhone: '',
    items: [],
    subtotal: 0,
    discount: 0,
    couponDiscount: 0,
    promotionDiscount: 0,
    freeItemsValue: 0,
    shipping: 0,
    total: 0,
    vat: 0,
    preVat: 0
  })
  const [taxInvoiceRecordedStatus, setTaxInvoiceRecordedStatus] = useState({})
  const [vatRate, setVatRate] = useState(7)
  const [packingOrder, setPackingOrder] = useState(null)
  const [packedOrderIds, setPackedOrderIds] = useState(new Set()) // orderId ที่บันทึกการแพ็กแล้ว
  const [productSupplierLookups, setProductSupplierLookups] = useState(() => ({
    byId: new Map(),
    byName: new Map()
  }))
  const [createOrderOpen, setCreateOrderOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalOrders, setTotalOrders] = useState(0)
  const [orderCounts, setOrderCounts] = useState({
    All: 0,
    รอตรวจสอบ: 0,
    กำลังจัดเตรียม: 0,
    จัดส่งแล้ว: 0,
    ยกเลิก: 0
  })
  const [debouncedSearchOrderId, setDebouncedSearchOrderId] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchOrderId(String(searchOrderId || '').trim()), 400)
    return () => clearTimeout(t)
  }, [searchOrderId])

  useEffect(() => {
    getVatRate().then(setVatRate)
  }, [])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const [pageResult, counts, plist] = await Promise.all([
        orderService.getOrdersPage({
          page: currentPage,
          pageSize: ADMIN_ORDERS_PAGE_SIZE,
          statusFilter,
          searchOrderId: debouncedSearchOrderId,
          showAllDates,
          startDate,
          endDate
        }),
        orderService.getAdminOrderStatusCounts({
          searchOrderId: debouncedSearchOrderId,
          showAllDates,
          startDate,
          endDate
        }),
        productService.getAllProducts(user, '')
      ])

      const total = pageResult.totalOrders ?? 0
      const maxPage = Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE))
      if (currentPage > maxPage) {
        setCurrentPage(maxPage)
        return
      }

      setOrders(pageResult.orders || [])
      setTotalOrders(total)
      setOrderCounts(counts)

      try {
        setProductSupplierLookups(buildProductSupplierLookups(plist))
      } catch (e) {
        console.warn('[AdminOrders] โหลด Supplier สินค้าไม่สำเร็จ:', e)
      }

      try {
        const { data: packingRows } = await supabase.from('order_packing').select('order_id')
        const fromApi = (packingRows || []).map((r) => r.order_id || r.OrderID || r.order_Id).filter(Boolean)
        setPackedOrderIds((prev) => {
          const next = new Set(fromApi)
          prev.forEach((id) => next.add(id))
          return next
        })
      } catch (_) {
        // ไม่เคลียร์ prev เพื่อไม่ให้ปุ่มกลับเป็นส้มเมื่อ query ผิดพลาด
      }

      const ids = (pageResult.orders || []).map((o) => o.ID || o.OrderID).filter(Boolean)
      const taxMap = await taxInvoiceService.getTaxInvoiceAdminStatusMapForOrderIds(ids)
      setTaxInvoiceRecordedStatus(taxMap)
    } catch (error) {
      console.error('Error fetching orders:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลออเดอร์ได้'
      })
    } finally {
      setLoading(false)
      setHasLoadedOrders(true)
    }
  }, [
    currentPage,
    statusFilter,
    debouncedSearchOrderId,
    showAllDates,
    startDate,
    endDate,
    user
  ])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const askSlipAcknowledgment = async (order) => {
    if (!order) return true
    if (!order.SlipURL) {
      const result = await Swal.fire({
        icon: 'warning',
        title: 'ยังไม่มีสลิปโอนเงิน',
        text: 'ออเดอร์นี้ยังไม่มีสลิปโอนเงินแนบ คุณต้องการดำเนินการต่อหรือไม่?',
        showCancelButton: true,
        confirmButtonText: 'ดำเนินการต่อ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33'
      })
      return result.isConfirmed
    }
    const result = await Swal.fire({
      icon: 'question',
      title: 'ยืนยันการตรวจสอบสลิป',
      text: 'คุณได้ตรวจสอบสลิปโอนเงินแล้วใช่ไหม?',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280'
    })
    return result.isConfirmed
  }

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      const order = orders.find((o) => (o.ID || o.OrderID) === orderId)

      if (newStatus === 'กำลังจัดเตรียม') {
        if (!isOrderCentralFulfillment(order, productSupplierLookups)) {
          await Swal.fire({
            icon: 'info',
            title: 'ออเดอร์มีสินค้าซัพพลายภายนอก',
            text: 'ออเดอร์นี้ไม่เข้าขั้นจัดเตรียม/แพ็กส่วนกลาง ให้ใช้ปุ่มยืนยันไป «จัดส่งแล้ว» และพิมพ์รายการสินค้าแทน'
          })
          return
        }
        const slipOk = await askSlipAcknowledgment(order)
        if (!slipOk) return
      }

      if (newStatus === 'จัดส่งแล้ว' && order && order.Status === 'รอตรวจสอบ') {
        const slipOk = await askSlipAcknowledgment(order)
        if (!slipOk) return
      }

      // Handle cancel order with note
      // ย้อนกลับสถานะเป็น รอตรวจสอบ (แสดงปุ่มยกเลิก/แก้ไขได้อีก)
      if (newStatus === 'รอตรวจสอบ') {
        const result = await Swal.fire({
          icon: 'question',
          title: 'ย้อนกลับสถานะออเดอร์',
          html: `
            <p class="text-gray-700">ต้องการย้อนกลับออเดอร์นี้เป็นสถานะ <strong>รอตรวจสอบ</strong> หรือไม่?</p>
            <p class="text-sm text-gray-600 mt-2">เมื่อกลับแล้วจะสามารถกด <strong>ยกเลิก</strong> หรือ <strong>แก้ไข</strong> ออเดอร์ได้ตามปกติ</p>
          `,
          showCancelButton: true,
          confirmButtonText: 'ย้อนกลับสถานะ',
          cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#6b7280',
          cancelButtonColor: '#16a34a'
        })
        if (!result.isConfirmed) return
      }

      // Handle cancel order with note
      if (newStatus === 'ยกเลิก') {
        const { value: cancelForm, isConfirmed: cancelConfirmed } = await Swal.fire({
          icon: 'warning',
          title: 'ยืนยันการยกเลิกออเดอร์',
          html: `
            <div class="text-left space-y-3">
              <p class="text-gray-700">คุณต้องการยกเลิกออเดอร์นี้หรือไม่?</p>
              <p class="text-sm text-gray-600">ระบบจะแจ้งเตือนลูกค้าถึงการยกเลิกออเดอร์</p>
              <div>
                <label for="swal-refund-credit" class="block text-sm font-semibold text-gray-800 mb-1">การคืนเงิน / เครดิต</label>
                <select id="swal-refund-credit" class="swal2-input" style="width:100%;display:block;margin:0;">
                  <option value="yes">คืนเข้าเครดิตลูกค้าอัตโนมัติ (แนะนำ) — เมื่อชำระด้วยเครดิตหรือโอนเงิน</option>
                  <option value="no">ไม่คืนเครดิตอัตโนมัติ — คืนเงินนอกระบบแล้ว / เคสพิเศษ</option>
                </select>
                <p class="text-xs text-amber-800 mt-1.5 leading-snug">ถ้าเลือกไม่คืน ระบบจะไม่บวกเครดิตกลับให้ลูกค้า ตรวจสอบให้แน่ใจก่อนยืนยัน</p>
              </div>
              <div>
                <label for="swal-cancel-note" class="block text-sm font-semibold text-gray-800 mb-1">หมายเหตุ (ถ้ามี)</label>
                <textarea id="swal-cancel-note" class="swal2-textarea" placeholder="ระบุเหตุผลในการยกเลิกออเดอร์..." rows="3" style="width:100%;box-sizing:border-box;"></textarea>
              </div>
              <p class="text-sm text-blue-600 font-bold">สินค้าทั้งหมดในออเดอร์จะถูกคืนเข้าสต๊อกอัตโนมัติ</p>
            </div>
          `,
          focusConfirm: false,
          showCancelButton: true,
          confirmButtonText: 'ยืนยันยกเลิก',
          cancelButtonText: 'ปิด',
          confirmButtonColor: '#d33',
          cancelButtonColor: '#6b7280',
          preConfirm: () => {
            const sel = document.getElementById('swal-refund-credit')
            const ta = document.getElementById('swal-cancel-note')
            const refundCredit = sel ? sel.value === 'yes' : true
            const cancelNote = ta && ta.value ? String(ta.value).trim() : ''
            return { refundCredit, cancelNote }
          }
        })

        if (!cancelConfirmed || !cancelForm) return

        const { refundCredit, cancelNote } = cancelForm

        // Get order to check payment method and refund credit
        const order = orders.find(o => (o.ID || o.OrderID) === orderId)
        if (order) {
          const userEmail = order.UserEmail || order.User
          const paymentMethod = order.PaymentMethod || order.paymentmethod
          const orderTotal = parseFloat(order.Total || order.total || 0)
          
          // Check if order used credit payment
          let creditUsed = false
          let creditAmount = 0
          
          console.log('[AdminOrders] Checking credit usage for order:', {
            orderId,
            userEmail,
            paymentMethod,
            orderTotal
          })
          
          // Method 1: Check PaymentMethod
          if (paymentMethod === 'credit') {
            creditUsed = true
            creditAmount = orderTotal
            console.log('[AdminOrders] Credit used via PaymentMethod:', creditAmount)
          } else {
            // Method 2: Check credit_usage_log for this order (more reliable)
            try {
              const orderUsageLogs = await creditService.getCreditUsageLogByOrderId(orderId)
              console.log('[AdminOrders] Credit usage logs for order:', orderUsageLogs)
              
              // Find positive amount (credit deduction, not refund)
              // Note: Positive amount = credit was used, Negative amount = credit was refunded
              const orderUsage = orderUsageLogs.find(log => {
                const amount = parseFloat(log.Amount || log.amount || 0)
                return amount > 0 // Positive amount means credit was used
              })
              
              if (orderUsage) {
                creditUsed = true
                creditAmount = parseFloat(orderUsage.Amount || orderUsage.amount || 0)
                console.log('[AdminOrders] Credit used found in usage log:', creditAmount)
              } else {
                console.log('[AdminOrders] No positive credit usage found for order')
              }
            } catch (error) {
              console.error('[AdminOrders] Error checking credit usage log:', error)
              // Fallback: try to get from user's usage log
              try {
                const usageLogs = await creditService.getCreditUsageLog(userEmail)
                console.log('[AdminOrders] User credit usage logs:', usageLogs)
                
                const orderUsage = usageLogs.find(log => {
                  const logOrderId = log.OrderID || log.orderid || log.order_id
                  const amount = parseFloat(log.Amount || log.amount || 0)
                  return logOrderId === orderId && amount > 0
                })
                
                if (orderUsage) {
                  creditUsed = true
                  creditAmount = parseFloat(orderUsage.Amount || orderUsage.amount || 0)
                  console.log('[AdminOrders] Credit used found in user usage log:', creditAmount)
                } else {
                  console.log('[AdminOrders] No credit usage found in user logs')
                }
              } catch (fallbackError) {
                console.error('[AdminOrders] Error in fallback credit check:', fallbackError)
              }
            }
          }
          
          // Method 3: If still not found, check if order was paid with credit by checking order total vs credit balance
          // This is a last resort - if order total matches a credit deduction, assume credit was used
          if (!creditUsed && orderTotal > 0) {
            try {
              const usageLogs = await creditService.getCreditUsageLog(userEmail)
              // Look for any credit deduction around the order time
              const orderTimestamp = order.Timestamp || order.CreatedAt || order.timestamp
              if (orderTimestamp) {
                const orderDate = new Date(orderTimestamp)
                const orderUsage = usageLogs.find(log => {
                  const logDate = new Date(log.CreatedAt || log.createdat || log.Created_at || 0)
                  const amount = parseFloat(log.Amount || log.amount || 0)
                  const logOrderId = log.OrderID || log.orderid || log.order_id
                  // Check if amount matches order total and date is close (within 1 hour)
                  const timeDiff = Math.abs(orderDate - logDate)
                  return amount > 0 && 
                         Math.abs(amount - orderTotal) < 1 && // Amount matches (within 1 baht)
                         timeDiff < 3600000 && // Within 1 hour
                         (!logOrderId || logOrderId !== orderId) // Not already linked to this order
                })
                
                if (orderUsage) {
                  creditUsed = true
                  creditAmount = parseFloat(orderUsage.Amount || orderUsage.amount || 0)
                  console.log('[AdminOrders] Credit used found by matching amount and time:', creditAmount)
                }
              }
            } catch (error) {
              console.error('[AdminOrders] Error in final credit check:', error)
            }
          }
          
          console.log('[AdminOrders] Final credit check result:', {
            creditUsed,
            creditAmount,
            orderId,
            userEmail,
            paymentMethod
          })
          
          // Determine refund amount based on payment method
          let refundAmount = 0
          let shouldRefund = false
          
          if (creditUsed && creditAmount > 0) {
            // Case 1: Order was paid with credit - refund the credit amount
            refundAmount = creditAmount
            shouldRefund = true
            console.log(`[AdminOrders] Order paid with credit, will refund: ${refundAmount}`)
          } else if (paymentMethod === 'transfer' && orderTotal > 0) {
            // Case 2: Order was paid with transfer - refund to credit account
            refundAmount = orderTotal
            shouldRefund = true
            console.log(`[AdminOrders] Order paid with transfer, will refund to credit: ${refundAmount}`)
          }
          
          let creditRefundedToCustomer = false

          // Refund credit/transfer amount to customer's credit account (เมื่อแอดมินเลือกคืนเครดิต)
          if (refundCredit && shouldRefund && refundAmount > 0 && userEmail) {
            try {
              const paymentType = creditUsed ? 'เครดิต' : 'เงินโอน'
              console.log(`[AdminOrders] Attempting to refund ${paymentType}: ${refundAmount} to ${userEmail} for order ${orderId}`)
              
              const refundResult = await creditService.addCredit(
                userEmail,
                refundAmount,
                orderId,
                `คืนเงินจากการยกเลิกออเดอร์ ${orderId} (ชำระด้วย${paymentType})${cancelNote ? ` - ${cancelNote}` : ''}`
              )
              
              console.log(`[AdminOrders] Refund successful:`, refundResult)
              creditRefundedToCustomer = true
              
              Swal.fire({
                icon: 'success',
                title: 'คืนเงินสำเร็จ',
                html: `
                  <div class="text-left">
                    <p class="mb-2">คืนเงินจำนวน <strong>฿${refundAmount.toLocaleString()}</strong> เข้าเครดิตของลูกค้าแล้ว</p>
                    <p class="text-sm text-gray-600">ชำระด้วย: ${paymentType}</p>
                    <p class="text-sm text-gray-600">บันทึกลงประวัติการใช้เครดิตเรียบร้อย</p>
                  </div>
                `,
                timer: 2000,
                showConfirmButton: false
              })
            } catch (error) {
              console.error('[AdminOrders] Error refunding:', error)
              Swal.fire({
                icon: 'warning',
                title: 'คืนเงินไม่สำเร็จ',
                html: `
                  <div class="text-left">
                    <p class="mb-2">ไม่สามารถคืนเงินให้ลูกค้าได้</p>
                    <p class="mb-2 text-sm text-gray-600">จำนวนที่ควรคืน: ฿${refundAmount.toLocaleString()}</p>
                    <p class="text-sm text-red-600">${error.message || 'เกิดข้อผิดพลาด'}</p>
                    <p class="mt-4 text-xs text-gray-500">กรุณาคืนเงินให้ลูกค้าด้วยตนเอง</p>
                  </div>
                `,
                confirmButtonText: 'ตกลง'
              })
            }
          } else {
            if (!refundCredit && shouldRefund && refundAmount > 0) {
              console.log(`[AdminOrders] Refund skipped by admin for order ${orderId} (amount ฿${refundAmount})`)
            } else if (orderTotal > 0) {
              console.log(`[AdminOrders] No refund processed for order ${orderId}`)
            }
            console.log(`[AdminOrders] Order details:`, {
              orderId,
              paymentMethod,
              orderTotal,
              userEmail,
              creditUsed,
              creditAmount,
              shouldRefund,
              refundCredit
            })
          }
          
          // Restore stock: อ่าน BUNDLE_IDS จาก Itemname หรือคืนที่ parent ตาม ProductID
          if (order.Items && order.Items.length > 0) {
            try {
              const restoredItems = []
              const failedItems = []
              const actor = user?.email || 'admin'
              for (const item of order.Items) {
                try {
                  await restoreStockForCancelledOrderItem(item, actor, orderId)
                  restoredItems.push({
                    name: orderItemNameFirstLine(item.name || ''),
                    qty: item.qty,
                    id: item.id
                  })
                } catch (itemError) {
                  console.error(`Error restoring stock for line:`, itemError)
                  failedItems.push(orderItemNameFirstLine(item.name || '') || item.id || '?')
                }
              }
              if (restoredItems.length > 0) {
                console.log(`Stock restored for ${restoredItems.length} lines from cancelled order ${orderId}`)
              }
              if (failedItems.length > 0) {
                console.warn(`Failed to restore stock for ${failedItems.length} lines:`, failedItems)
              }
            } catch (stockError) {
              console.error('Error restoring stock:', stockError)
              Swal.fire({
                icon: 'warning',
                title: 'คืนสินค้าเข้าสต๊อกไม่สำเร็จ',
                text: `ไม่สามารถคืนสินค้าเข้าสต๊อกได้: ${stockError.message || 'เกิดข้อผิดพลาด'}`,
                timer: 3000,
                showConfirmButton: false
              })
            }
          }
          
          const refundNoteForCustomer = creditRefundedToCustomer
            ? `\nเครดิตจำนวน ฿${refundAmount.toLocaleString()} ถูกคืนเข้าบัญชีแล้ว`
            : !refundCredit && shouldRefund && refundAmount > 0
              ? '\nไม่มีการคืนเครดิตอัตโนมัติ — หากมีเงินค้างโปรดติดต่อร้าน'
              : ''

          await notificationService.createNotification(
            userEmail,
            'order_cancelled',
            'ออเดอร์ถูกยกเลิก',
            `ออเดอร์ ${orderId} ถูกยกเลิก${refundNoteForCustomer}${cancelNote ? `\nหมายเหตุ: ${cancelNote}` : ''}`,
            orderId,
            {
              note: cancelNote || '',
              creditRefunded: creditRefundedToCustomer,
              creditAmount: creditRefundedToCustomer ? refundAmount : 0,
              refundSkippedByAdmin: !refundCredit && shouldRefund && refundAmount > 0
            }
          )
        }
      }

      let tracking = null
      if (newStatus === 'จัดส่งแล้ว') {
        const { value: trackingValue } = await Swal.fire({
          title: 'กรอกเลขที่พัสดุ',
          input: 'text',
          inputLabel: 'เลขที่พัสดุ',
          inputPlaceholder: 'กรอกเลขที่พัสดุ',
          showCancelButton: true,
          confirmButtonText: 'ยืนยัน',
          cancelButtonText: 'ยกเลิก',
          inputValidator: (value) => {
            if (!value) {
              return 'กรุณากรอกเลขที่พัสดุ'
            }
          }
        })

        if (!trackingValue) return
        tracking = trackingValue
      }

      await orderService.updateOrderStatus(orderId, newStatus, tracking)

      // เมื่อย้อนกลับเป็น รอตรวจสอบ ให้ลบข้อมูลการแพ็ก (order_packing) ของออเดอร์นี้ด้วย
      if (newStatus === 'รอตรวจสอบ') {
        try {
          await packingService.savePacking(orderId, [])
        } catch (err) {
          console.warn('[AdminOrders] ลบข้อมูลการแพ็กไม่สำเร็จ:', err)
        }
      }
      
      // Send notification for status change
      if (order && newStatus !== 'รอตรวจสอบ') {
        const statusMessages = {
          'กำลังจัดเตรียม': `ออเดอร์ ${orderId} ของคุณกำลังถูกจัดเตรียม`,
          'จัดส่งแล้ว': `ออเดอร์ ${orderId} ของคุณถูกจัดส่งแล้ว${tracking ? `\nเลขที่พัสดุ: ${tracking}` : ''}`,
          'ยกเลิก': `ออเดอร์ ${orderId} ของคุณถูกยกเลิก`
        }
        
        await notificationService.createNotification(
          order.UserEmail || order.User,
          'order_status_changed',
          'สถานะออเดอร์เปลี่ยนแปลง',
          statusMessages[newStatus] || `สถานะออเดอร์ ${orderId} เปลี่ยนเป็น: ${newStatus}`,
          orderId,
          { status: newStatus, tracking: tracking || null }
        )
      }
      
      Swal.fire({
        icon: 'success',
        title: 'อัปเดตสถานะสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      })

      fetchOrders()
    } catch (error) {
      console.error('Error updating order status:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถอัปเดตสถานะได้'
      })
    }
  }

  const handleEditOrder = (order) => {
    setEditingOrder(order)
    setEditingItems(order.Items?.map(item => ({ ...item })) || [])
    setEditingShipping(order['Shipping Cost'] || order.Shipping || 0)
  }

  // คำนวณค่าจัดส่งจากน้ำหนักสินค้าปัจจุบันตามตาราง shipping_rates
  const handleCalculateShippingByWeight = async () => {
    if (!editingItems || editingItems.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่มีรายการสินค้า',
        text: 'กรุณาเพิ่มรายการสินค้าก่อนคำนวณค่าจัดส่ง'
      })
      return
    }
    try {
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('ProductID, ProductName, Weight')

      if (productsError) throw productsError

      const getWeight = (item) => {
        const pid = String(item?.id || item?.productId || '').trim()
        const name = String(item?.name || '').trim()
        const list = products || []
        if (pid) {
          const byId = list.find((p) => String(p.ProductID || '').trim() === pid)
          if (byId) return Number(byId.Weight) || 0
        }
        if (name) {
          const byName = list.find((p) => String(p.ProductName || '').trim() === name)
          if (byName) return Number(byName.Weight) || 0
        }
        return 0
      }

      const totalWeight = editingItems.reduce((sum, item) => {
        const qty = typeof item.qty === 'string' ? parseInt(item.qty, 10) : (item.qty || 0)
        return sum + (isNaN(qty) ? 0 : qty) * getWeight(item)
      }, 0)

      const { data: rates, error: ratesError } = await supabase
        .from('shipping_rates')
        .select('*')
        .order('MinWeight', { ascending: true })

      let cost = 0
      if (ratesError || !rates || rates.length === 0) {
        cost = calculateFallbackShipping(totalWeight)
      } else {
        cost = pickShippingRateCost(totalWeight, rates).cost
      }

      setEditingShipping(cost)
      Swal.fire({
        icon: 'success',
        title: 'คำนวณค่าจัดส่งแล้ว',
        text: `น้ำหนักรวม ${totalWeight.toLocaleString()} กรัม → ค่าจัดส่ง ฿${cost.toLocaleString()}`,
        timer: 2000,
        showConfirmButton: false
      })
    } catch (err) {
      console.error('Error calculating shipping:', err)
      Swal.fire({
        icon: 'error',
        title: 'คำนวณค่าจัดส่งไม่สำเร็จ',
        text: err.message || 'ไม่สามารถดึงอัตราค่าจัดส่งได้'
      })
    }
  }

  const handleSaveEdit = async () => {
    if (!editingOrder) return

    try {
      // Filter out items with qty 0 or empty, and ensure all qty are valid numbers
      const validItems = editingItems
        .map(item => ({
          ...item,
          qty: typeof item.qty === 'string' && item.qty.trim() === '' ? 0 : (parseInt(item.qty) || 0)
        }))
        .filter(item => item.qty > 0)
      
      if (validItems.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'ไม่สามารถบันทึกได้',
          text: 'ต้องมีสินค้าอย่างน้อย 1 รายการในออเดอร์'
        })
        return
      }
      
      // Calculate totals with discount
      // Calculate old subtotal excluding free items
      const oldDiscountInfo = String(editingOrder.DiscountInfo || editingOrder.discountinfo || "")
      const oldFreeItemsMatch = oldDiscountInfo.match(/FreeItems:\s*([^|]+)/i)
      const oldFreeItemsMap = new Map()
      if (oldFreeItemsMatch) {
        const oldFreeItemsStr = oldFreeItemsMatch[1].trim()
        oldFreeItemsStr.split(',').forEach(itemStr => {
          const match = itemStr.trim().match(/^(.+?):(\d+)$/)
          if (match) {
            const itemName = match[1].trim()
            const freeQty = parseInt(match[2])
            oldFreeItemsMap.set(itemName, freeQty)
          }
        })
      }
      
      const oldSubtotal = (editingOrder.Items || []).reduce((sum, item) => {
        const itemName = item.name || ''
        const freeQty = oldFreeItemsMap.get(itemName) || 0
        const paidQty = Math.max(0, (item.qty || 0) - freeQty)
        return sum + (item.price || 0) * paidQty
      }, 0)
      let oldDiscount = 0
      // Try to get discount from DiscountInfo (format: "-XXXB" or "Code: XXX, Amount: YYY")
      // Note: oldDiscountInfo is already declared above
      const oldDiscountMatch = oldDiscountInfo.match(/-(\d+)B/)
      if (oldDiscountMatch) {
        oldDiscount = parseInt(oldDiscountMatch[1])
      } else {
        // Try to get discount from Amount in DiscountInfo
        const oldAmountMatch = oldDiscountInfo.match(/Amount:\s*(\d+)/i)
        if (oldAmountMatch) {
          oldDiscount = parseInt(oldAmountMatch[1])
        } else {
          // Fallback to Discount column
          oldDiscount = Number(editingOrder.Discount || editingOrder.discount || 0)
        }
      }
      const oldShipping = Number(editingOrder['Shipping Cost'] || editingOrder.ShippingCost || editingOrder.Shipping || 0)
      const oldTotal = oldSubtotal - oldDiscount + oldShipping
      
      // Calculate new subtotal excluding free items (if any)
      // Note: When editing, we assume all items in validItems are paid items
      // If there are free items, they should be handled separately
      const newSubtotal = validItems.reduce((sum, item) => sum + (item.price * item.qty), 0)
      // Keep existing discount if not changed
      let newDiscount = oldDiscount
      const newTotal = newSubtotal - newDiscount + editingShipping

      const diff = newTotal - oldTotal

      // Show confirmation with difference
      const result = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการแก้ไขออเดอร์',
        html: `
          <div class="text-left">
            <p class="mb-2"><strong>ยอดเดิม:</strong> ฿${oldTotal.toLocaleString()}</p>
            <p class="mb-2"><strong>ยอดใหม่:</strong> ฿${newTotal.toLocaleString()}</p>
            <p class="mb-4 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}">
              <strong>ส่วนต่าง:</strong> ${diff > 0 ? '+' : ''}฿${diff.toLocaleString()}
            </p>
            <p class="text-sm text-gray-600">ระบบจะแจ้งเตือนลูกค้าถึงการเปลี่ยนแปลงนี้</p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#6b7280'
      })

      if (!result.isConfirmed) return

      // Check credit if difference is positive (customer needs to pay more)
      const customerEmail = editingOrder.UserEmail || editingOrder.User
      const orderId = editingOrder.ID || editingOrder.OrderID
      
      if (diff > 0 && customerEmail) {
        try {
          // Check customer credit balance
          const customerCredit = await creditService.getUserCredit(customerEmail)
          const creditBalance = customerCredit.balance || 0

          if (creditBalance < diff) {
            Swal.fire({
              icon: 'error',
              title: 'เครดิตไม่พอ',
              html: `
                <div class="text-left">
                  <p class="mb-2">ลูกค้ามีเครดิต: <strong>฿${creditBalance.toLocaleString()}</strong></p>
                  <p class="mb-2">ต้องจ่ายเพิ่ม: <strong>฿${diff.toLocaleString()}</strong></p>
                  <p class="mb-2 text-red-600">ขาด: <strong>฿${(diff - creditBalance).toLocaleString()}</strong></p>
                  <p class="text-sm text-gray-600 mt-4">ไม่สามารถยืนยันการแก้ไขออเดอร์ได้</p>
                </div>
              `,
              confirmButtonText: 'ตกลง'
            })
            return
          }
        } catch (error) {
          console.error('Error checking credit:', error)
          Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: 'ไม่สามารถตรวจสอบเครดิตลูกค้าได้: ' + (error.message || error)
          })
          return
        }
      }

      Swal.fire({
        title: 'กำลังแก้ไขออเดอร์...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      await orderService.editOrder(
        orderId,
        validItems,
        editingShipping,
        user.email
      )

      // Handle credit deduction/addition
      if (diff !== 0 && customerEmail) {
        try {
          console.log(`[AdminOrders] Updating credit for order edit:`, {
            orderId,
            customerEmail,
            diff,
            oldTotal,
            newTotal
          })
          
          if (diff > 0) {
            // Deduct credit (หักเครดิต) - customer needs to pay more
            console.log(`[AdminOrders] Deducting credit: ${diff} from ${customerEmail}`)
            const deductResult = await creditService.deductCredit(
              customerEmail,
              diff,
              orderId,
              `หักเครดิตจากการแก้ไขออเดอร์ ${orderId} (ส่วนต่างเพิ่ม)`
            )
            console.log(`[AdminOrders] Credit deducted successfully:`, deductResult)
            
            // Show success message
            Swal.fire({
              icon: 'success',
              title: 'หักเครดิตสำเร็จ',
              html: `
                <div class="text-left">
                  <p class="mb-2">หักเครดิตจำนวน <strong>฿${diff.toLocaleString()}</strong> จากบัญชีลูกค้าแล้ว</p>
                  <p class="text-sm text-gray-600">บันทึกลงประวัติการใช้เครดิตเรียบร้อย</p>
                </div>
              `,
              timer: 2000,
              showConfirmButton: false
            })
          } else if (diff < 0) {
            // Add credit (คืนเครดิต) - customer gets refund
            const refundAmount = Math.abs(diff)
            console.log(`[AdminOrders] Refunding credit: ${refundAmount} to ${customerEmail}`)
            const refundResult = await creditService.addCredit(
              customerEmail,
              refundAmount,
              orderId,
              `คืนเครดิตจากการแก้ไขออเดอร์ ${orderId} (ส่วนต่างลด)`
            )
            console.log(`[AdminOrders] Credit refunded successfully:`, refundResult)
            
            // Show success message
            Swal.fire({
              icon: 'success',
              title: 'คืนเครดิตสำเร็จ',
              html: `
                <div class="text-left">
                  <p class="mb-2">คืนเครดิตจำนวน <strong>฿${refundAmount.toLocaleString()}</strong> ให้ลูกค้าแล้ว</p>
                  <p class="text-sm text-gray-600">บันทึกลงประวัติการใช้เครดิตเรียบร้อย</p>
                </div>
              `,
              timer: 2000,
              showConfirmButton: false
            })
          }
        } catch (error) {
          console.error('[AdminOrders] Error updating credit:', error)
          // Don't block the order edit, just log the error
          Swal.fire({
            icon: 'warning',
            title: 'แก้ไขออเดอร์สำเร็จ',
            html: `
              <div class="text-left">
                <p class="mb-2">แต่เกิดข้อผิดพลาดในการอัปเดตเครดิต</p>
                <p class="mb-2 text-sm text-gray-600">ส่วนต่าง: ${diff > 0 ? '+' : ''}฿${diff.toLocaleString()}</p>
                <p class="text-sm text-red-600">${error.message || error}</p>
                <p class="mt-4 text-xs text-gray-500">กรุณาอัปเดตเครดิตให้ลูกค้าด้วยตนเอง</p>
              </div>
            `,
            confirmButtonText: 'ตกลง'
          })
        }
      } else {
        console.log(`[AdminOrders] No credit update needed (diff = ${diff})`)
      }

      // Send notification to customer (customerEmail already defined above)
      if (customerEmail) {
        const diffText = diff > 0 
          ? `ต้องชำระเพิ่ม ฿${diff.toLocaleString()}` 
          : diff < 0 
          ? `จะคืนเงิน ฿${Math.abs(diff).toLocaleString()}` 
          : 'ไม่มีการเปลี่ยนแปลงราคา'
        
        await notificationService.createNotification(
          customerEmail,
          'order_edited',
          'ออเดอร์ถูกแก้ไข',
          `ออเดอร์ ${orderId} ถูกแก้ไข\n${diffText}`,
          orderId,
          { 
            diff: diff,
            oldTotal: oldTotal,
            newTotal: newTotal,
            items: editingItems
          }
        )
      }

      Swal.close()
      const creditAction = diff > 0 
        ? `หักจากเครดิตลูกค้า ฿${diff.toLocaleString()}`
        : diff < 0
        ? `คืนเข้าเครดิตลูกค้า ฿${Math.abs(diff).toLocaleString()}`
        : 'ไม่มีการเปลี่ยนแปลงราคา'
      
      Swal.fire({
        icon: 'success',
        title: 'แก้ไขออเดอร์สำเร็จ',
        html: `
          <div class="text-left">
            <p class="mb-2"><strong>ส่วนต่าง:</strong> ${diff > 0 ? '+' : ''}฿${diff.toLocaleString()}</p>
            <p class="mb-2"><strong>การจัดการเครดิต:</strong> ${creditAction}</p>
            <p class="text-sm">ระบบจะแจ้งเตือนลูกค้าแล้ว</p>
          </div>
        `,
        confirmButtonText: 'ตกลง'
      })

      // ลบใบกำกับภาษีของออเดอร์นี้ เพื่อให้ออกใบกำกับใหม่ตามรายการล่าสุด
      try {
        await taxInvoiceService.deleteTaxInvoiceByOrderId(orderId)
        setTaxInvoiceRecordedStatus(prev => {
          const next = { ...prev }
          delete next[orderId]
          return next
        })
      } catch (e) {
        console.warn('[AdminOrders] ลบใบกำกับหลังแก้ไขออเดอร์ไม่สำเร็จ:', e)
      }

      setEditingOrder(null)
      setEditingItems([])
      setEditingShipping(0)
      fetchOrders()
    } catch (error) {
      Swal.close()
      console.error('Error editing order:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถแก้ไขออเดอร์ได้'
      })
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return dateStr
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'รอตรวจสอบ':
        return 'bg-yellow-100 text-yellow-800'
      case 'กำลังจัดเตรียม':
        return 'bg-blue-100 text-blue-800'
      case 'จัดส่งแล้ว':
        return 'bg-green-100 text-green-800'
      case 'ยกเลิก':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const toggleOrderSelection = (orderId) => {
    setSelectedOrdersForShipping(prev => {
      if (prev.includes(orderId)) {
        // ถ้าเลือกอยู่แล้ว ให้ยกเลิกการเลือก
        const newTracking = { ...trackingNumbers }
        delete newTracking[orderId]
        setTrackingNumbers(newTracking)
        return prev.filter(id => id !== orderId)
      } else {
        // ถ้ายังไม่เลือก ให้เพิ่ม
        return [...prev, orderId]
      }
    })
  }

  const handleTrackingNumberChange = (orderId, value) => {
    setTrackingNumbers(prev => ({
      ...prev,
      [orderId]: value
    }))
  }

  const handleBulkShipOrders = async () => {
    const ordersToShip = selectedOrdersForShipping.filter(orderId => {
      const tracking = trackingNumbers[orderId]?.trim()
      return tracking && tracking.length > 0
    })

    if (ordersToShip.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'กรุณาเลือกออเดอร์และกรอกเลขพัสดุอย่างน้อย 1 รายการ'
      })
      return
    }

    try {
      Swal.fire({
        title: 'กำลังทำรายการ...',
        text: `กำลังส่งสินค้า ${ordersToShip.length} รายการ...`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const promises = ordersToShip.map(async (orderId) => {
        const tracking = trackingNumbers[orderId].trim()
        const order = orders.find(o => (o.ID || o.OrderID) === orderId)
        
        // Update order status
        await orderService.updateOrderStatus(orderId, 'จัดส่งแล้ว', tracking)
        
        // Send notification
        if (order) {
        await notificationService.createNotification(
          order.UserEmail || order.User,
          'order_status_changed',
          'สถานะออเดอร์เปลี่ยนแปลง',
          `ออเดอร์ ${orderId} ของคุณถูกจัดส่งแล้ว\nเลขที่พัสดุ: ${tracking}`,
          orderId,
          { status: 'จัดส่งแล้ว', tracking: tracking }
        )
        }
        
        return { success: true, orderId }
      })

      const results = await Promise.all(promises)
      const successCount = results.filter(r => r.success).length
      const failCount = results.length - successCount

      Swal.close()

      if (failCount === 0) {
        Swal.fire({
          icon: 'success',
          title: 'ทำรายการเสร็จแล้ว',
          text: `ส่งสินค้า ${successCount} รายการเรียบร้อย`,
          confirmButtonText: 'เสร็จสิ้น'
        }).then(() => {
          setSelectedOrdersForShipping([])
          setTrackingNumbers({})
          fetchOrders()
        })
      } else {
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: `ส่งสำเร็จ ${successCount} รายการ, ล้มเหลว ${failCount} รายการ`,
          confirmButtonText: 'เสร็จสิ้น'
        }).then(() => {
          fetchOrders()
        })
      }
    } catch (error) {
      Swal.close()
      console.error('Error bulk shipping orders:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถส่งสินค้าได้'
      })
    }
  }

  // Print functions
  const handlePrintLabel = async (order) => {
    Swal.fire({ title: 'กำลังเตรียมพิมพ์...', didOpen: () => Swal.showLoading() })
    try {
      await printService.printShippingLabel(order)
      Swal.close()
    } catch (error) {
      Swal.close()
      console.error('Error printing label:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถพิมพ์ใบปะหน้าได้'
      })
    }
  }

  const handlePrintReceipt = async (order) => {
    Swal.fire({ title: 'กำลังเตรียมพิมพ์...', didOpen: () => Swal.showLoading() })
    try {
      await printService.printReceipt(order)
      Swal.close()
    } catch (error) {
      Swal.close()
      console.error('Error printing receipt:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถพิมพ์ใบเสร็จได้'
      })
    }
  }

  const handlePrintSupplierPickList = async (order) => {
    Swal.fire({ title: 'กำลังเตรียมพิมพ์...', didOpen: () => Swal.showLoading() })
    try {
      await printService.printSupplierPickList(order)
      Swal.close()
    } catch (error) {
      Swal.close()
      console.error('Error printing supplier pick list:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถพิมพ์รายการสินค้าได้'
      })
    }
  }

  const handleOpenTaxInvoiceModal = async (order) => {
    // Check if order is confirmed (not in 'รอตรวจสอบ' status)
    if (order.Status === 'รอตรวจสอบ') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณายืนยันออเดอร์ก่อน',
        text: 'ต้องยืนยันออเดอร์ก่อนจึงจะสามารถออกใบกำกับภาษีได้',
        confirmButtonText: 'ตกลง'
      })
      return
    }

    const orderId = order.ID || order.OrderID
    const userEmail = order.UserEmail || order.User || ''
    
    // Fetch customer phone number and tax information from users table
    let customerPhone = ''
    let userTaxName = ''
    let userTaxId = ''
    let userTaxAddress = ''
    let fetchedUserRow = null

    try {
      console.log('Fetching user data in modal for email:', userEmail)
      
      // Based on Supabase table structure, use PascalCase: Email and Phone
      // Try Email (PascalCase) first as seen in Login.jsx
      // Note: TaxID is all caps in database (not TaxId)
      let { data: userData, error: userError } = await supabase
        .from('users')
        .select('Phone, TaxID, TaxName, TaxAddress, Address, Subdistrict, District, Province, PostalCode')
        .eq('Email', userEmail)
        .maybeSingle()
      
      console.log('Modal query with Email (PascalCase):', { userData, userError, hasData: !!userData })
      
      // If not found or error, try lowercase email column (but keep column names with correct case)
      if (userError || !userData) {
        console.log('Modal: Trying with lowercase email column...')
        const result = await supabase
          .from('users')
          .select('Phone, TaxID, TaxName, TaxAddress, Address, Subdistrict, District, Province, PostalCode')
          .eq('email', userEmail)
          .maybeSingle()
        userData = result.data
        userError = result.error
        console.log('Modal query with email (lowercase):', { userData, userError, hasData: !!userData })
      }

      fetchedUserRow = userData || null
      
      if (!userError && userData) {
        // Try all possible phone column names
        customerPhone = userData.Phone || userData.PhoneNumber || ''
        if (customerPhone && customerPhone !== 'NULL' && customerPhone.trim() !== '') {
          console.log('Successfully fetched customer phone in modal:', customerPhone, 'for email:', userEmail)
        } else {
          console.warn('Modal: Phone found but is empty or NULL:', customerPhone)
          customerPhone = ''
        }
        
        // Get tax information (TaxID is all caps in database)
        userTaxName = userData.TaxName || ''
        userTaxId = userData.TaxID || ''
        userTaxAddress = userData.TaxAddress || ''
        
        if (userTaxId && userTaxId !== 'NULL' && userTaxId.trim() !== '') {
          console.log('Successfully fetched tax info in modal:', { taxName: userTaxName, taxId: userTaxId, taxAddress: userTaxAddress })
        } else {
          console.log('No tax ID found for user:', userEmail)
        }
      } else {
        console.warn('Modal: Error or no data found:', { userError, hasData: !!userData })
        if (userError) {
          console.error('Modal: Supabase error details:', userError)
        }
      }
    } catch (error) {
      console.error('Error fetching user data in modal:', error)
    }

    const userShipParts = shippingPartsFromUserRow(fetchedUserRow)
    const mergedShip = mergeAddressParts(partsFromOrder(order), userShipParts)
    const shippingAddressFull =
      formatAddressMultiline(mergedShip) || String(order.Address || order.address || '').trim()
    
    // โหลดรายการและยอดจากออเดอร์ปัจจุบันเสมอ (รองรับกรณีย้อนกลับมาแก้ไขออเดอร์แล้ว)
    // ใช้ existingData เฉพาะข้อมูลลูกค้า (ชื่อ/เลขประจำตัว/ที่อยู่) ถ้ามีใบบันทึกไว้แล้ว
    try {
      const existingData = await taxInvoiceService.getTaxInvoiceByOrderId(orderId)
      const useSavedTaxInfo = existingData.recorded && existingData.success

      {
        // Initialize with order data
        const items = (order.Items || []).map(item => ({
          name: item.name || '',
          qty: item.qty || 0,
          price: Number(item.price || 0),
          total: (item.qty || 0) * Number(item.price || 0)
        }))
        
        // Parse discount info to separate coupon discount and promotion discount
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
          const itemName = item.name || ''
          const freeQty = freeItemsMap.get(itemName) || 0
          const paidQty = Math.max(0, (item.qty || 0) - freeQty)
          return sum + (Number(item.price || 0) * paidQty)
        }, 0)
        
        // Parse coupon discount
        let couponDiscount = 0
        const couponMatch = discountInfo.match(/Code:.*?\(-(\d+(?:\.\d+)?)B?\)/i)
        if (couponMatch) {
          couponDiscount = parseFloat(couponMatch[1])
        }
        
        // Parse promotion discount
        let promotionDiscount = 0
        const promotionMatch = discountInfo.match(/Promotion:\s*-?(\d+(?:\.\d+)?)B?/i)
        if (promotionMatch) {
          promotionDiscount = parseFloat(promotionMatch[1])
        }
        
        // If no specific format found, try to parse from DiscountInfo or Discount column
        if (couponDiscount === 0 && promotionDiscount === 0) {
          const match = discountInfo.match(/-(\d+(?:\.\d+)?)B/)
          if (match) {
            if (discountInfo.includes('Code:')) {
              couponDiscount = parseFloat(match[1])
            } else {
              promotionDiscount = parseFloat(match[1])
            }
          } else {
            const amountMatch = discountInfo.match(/Amount:\s*(\d+(?:\.\d+)?)/i)
            if (amountMatch) {
              if (discountInfo.includes('Code:')) {
                couponDiscount = parseFloat(amountMatch[1])
              } else {
                promotionDiscount = parseFloat(amountMatch[1])
              }
            } else {
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
          items.forEach(item => {
            const itemName = item.name || ''
            const freeQty = freeItemsMap.get(itemName) || 0
            if (freeQty > 0) {
              freeItemsValue += (Number(item.price || 0) * freeQty)
            }
          })
        }
        
        const totalDiscount = couponDiscount + promotionDiscount + freeItemsValue
        // Try multiple column name variations including 'Shipping Cost' (with space)
        const shipping = Number(order['Shipping Cost'] || order.ShippingCost || order.Shipping || order.shippingCost || order.shipping || 0)
        const total = subtotal - totalDiscount + shipping
        const { vat, preVat } = calcVatFromTotal(total, vatRate)

        setEditingOrderForTax(order)
        setTaxInvoiceForm({
          taxName: useSavedTaxInfo ? (existingData.taxName || userTaxName || order.Username || order.UserEmail || order.User || '') : (userTaxName || order.Username || order.UserEmail || order.User || ''),
          taxId: useSavedTaxInfo ? (existingData.taxId || userTaxId || '') : (userTaxId || ''),
          taxAddress: useSavedTaxInfo ? (existingData.taxAddress || userTaxAddress || shippingAddressFull || order.Address || order.address || '') : (userTaxAddress || shippingAddressFull || order.Address || order.address || ''),
          customerPhone: customerPhone,
          items: items,
          subtotal: subtotal,
          discount: totalDiscount,
          couponDiscount: couponDiscount,
          promotionDiscount: promotionDiscount,
          freeItemsValue: freeItemsValue,
          shipping: shipping,
          total: total,
          vat: vat,
          preVat: preVat
        })
        if (useSavedTaxInfo) {
          setTaxInvoiceRecordedStatus(prev => ({
            ...prev,
            [orderId]: { recorded: true, data: existingData }
          }))
        }
      }
    } catch (error) {
      console.error('Error loading tax invoice data:', error)
      // Fallback to order data if error
      const items = (order.Items || []).map(item => ({
        name: item.name || '',
        qty: item.qty || 0,
        price: Number(item.price || 0),
        total: (item.qty || 0) * Number(item.price || 0)
      }))
      
      // Parse discount info to separate coupon discount and promotion discount
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
        const itemName = item.name || ''
        const freeQty = freeItemsMap.get(itemName) || 0
        const paidQty = Math.max(0, (item.qty || 0) - freeQty)
        return sum + (Number(item.price || 0) * paidQty)
      }, 0)
      
      // Parse coupon discount
      let couponDiscount = 0
      const couponMatch = discountInfo.match(/Code:.*?\(-(\d+(?:\.\d+)?)B?\)/i)
      if (couponMatch) {
        couponDiscount = parseFloat(couponMatch[1])
      }
      
      // Parse promotion discount
      let promotionDiscount = 0
      const promotionMatch = discountInfo.match(/Promotion:\s*-?(\d+(?:\.\d+)?)B?/i)
      if (promotionMatch) {
        promotionDiscount = parseFloat(promotionMatch[1])
      }
      
      // If no specific format found, try to parse from DiscountInfo or Discount column
      if (couponDiscount === 0 && promotionDiscount === 0) {
        const match = discountInfo.match(/-(\d+(?:\.\d+)?)B/)
        if (match) {
          if (discountInfo.includes('Code:')) {
            couponDiscount = parseFloat(match[1])
          } else {
            promotionDiscount = parseFloat(match[1])
          }
        } else {
          const amountMatch = discountInfo.match(/Amount:\s*(\d+(?:\.\d+)?)/i)
          if (amountMatch) {
            if (discountInfo.includes('Code:')) {
              couponDiscount = parseFloat(amountMatch[1])
            } else {
              promotionDiscount = parseFloat(amountMatch[1])
            }
          } else {
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
        items.forEach(item => {
          const itemName = item.name || ''
          const freeQty = freeItemsMap.get(itemName) || 0
          if (freeQty > 0) {
            freeItemsValue += (Number(item.price || 0) * freeQty)
          }
        })
      }
      
      const totalDiscount = couponDiscount + promotionDiscount + freeItemsValue
      // Try multiple column name variations including 'Shipping Cost' (with space)
      const shipping = Number(order['Shipping Cost'] || order.ShippingCost || order.Shipping || order.shippingCost || order.shipping || 0)
      const total = subtotal - totalDiscount + shipping
      const { vat, preVat } = calcVatFromTotal(total, vatRate)

      setEditingOrderForTax(order)
      setTaxInvoiceForm({
        taxName: userTaxName || order.Username || order.UserEmail || order.User || '',
        taxId: userTaxId || '',
        taxAddress: userTaxAddress || shippingAddressFull || order.Address || order.address || '',
        customerPhone: customerPhone,
        items: items,
        subtotal: subtotal,
        discount: totalDiscount,
        couponDiscount: couponDiscount,
        promotionDiscount: promotionDiscount,
        freeItemsValue: freeItemsValue,
        shipping: shipping,
        total: total,
        vat: vat,
        preVat: preVat
      })
    }
    
    setIsTaxInvoiceModalOpen(true)
  }

  const handleSubmitTaxInvoiceData = async () => {
    if (!taxInvoiceForm.taxName || !taxInvoiceForm.taxId) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'กรุณากรอกชื่อบริษัท/ผู้เสียภาษี และเลขประจำตัวผู้เสียภาษี'
      })
      return
    }

    try {
      Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false })
      
      const orderId = editingOrderForTax.ID || editingOrderForTax.OrderID
      const userEmail = editingOrderForTax.UserEmail || editingOrderForTax.User || user?.email || ''
      
      const invoiceData = {
        userEmail: userEmail,
        invoiceDate: new Date().toISOString(),
        taxName: taxInvoiceForm.taxName,
        taxId: taxInvoiceForm.taxId,
        taxAddress: taxInvoiceForm.taxAddress,
        customerPhone: taxInvoiceForm.customerPhone,
        items: taxInvoiceForm.items,
        subtotal: taxInvoiceForm.subtotal,
        discount: taxInvoiceForm.discount,
        shipping: taxInvoiceForm.shipping,
        total: taxInvoiceForm.total,
        vat: taxInvoiceForm.vat,
        preVat: taxInvoiceForm.preVat
      }

      const result = await taxInvoiceService.saveTaxInvoice(orderId, invoiceData, userEmail, true)

      if (result.success) {
        // Update local state
        setTaxInvoiceRecordedStatus(prev => ({
          ...prev,
          [orderId]: {
            recorded: true,
            data: invoiceData
          }
        }))

        Swal.close()
        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'บันทึกข้อมูลภาษีเรียบร้อยแล้ว',
          confirmButtonText: 'ตกลง'
        })
      } else {
        throw new Error('บันทึกข้อมูลไม่สำเร็จ')
      }
    } catch (error) {
      Swal.close()
      console.error('Error saving tax invoice data:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกข้อมูลได้'
      })
    }
  }

  const handlePrintTaxInvoice = async () => {
    if (!taxInvoiceForm.taxName || !taxInvoiceForm.taxId) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'กรุณากรอกชื่อบริษัท/ผู้เสียภาษี และเลขประจำตัวผู้เสียภาษี'
      })
      return
    }

    try {
      Swal.fire({ title: 'กำลังเตรียมพิมพ์...', didOpen: () => Swal.showLoading() })
      
      const orderId = editingOrderForTax.ID || editingOrderForTax.OrderID
      
      // Increment print count
      try {
        await taxInvoiceService.incrementPrintCount(orderId, user?.email || '', true) // isAdmin = true
      } catch (error) {
        console.warn('Could not increment print count:', error)
      }

      const taxData = {
        taxName: taxInvoiceForm.taxName,
        taxId: taxInvoiceForm.taxId,
        taxAddress: taxInvoiceForm.taxAddress,
        customerPhone: taxInvoiceForm.customerPhone,
        items: taxInvoiceForm.items,
        discount: taxInvoiceForm.discount,
        couponDiscount: taxInvoiceForm.couponDiscount || 0,
        promotionDiscount: taxInvoiceForm.promotionDiscount || 0,
        freeItemsValue: taxInvoiceForm.freeItemsValue || 0,
        shipping: taxInvoiceForm.shipping,
        invoiceDate: new Date()
      }
      
      await printService.printTaxInvoice(editingOrderForTax, taxData)
      Swal.close()
    } catch (error) {
      Swal.close()
      console.error('Error printing tax invoice:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถพิมพ์ใบกำกับภาษีได้'
      })
    }
  }

  // รายการในหน้านี้ถูกกรอง/แบ่งหน้าแล้วที่ฝั่งเซิร์ฟเวอร์ (หรือ fallback ใน orderService)
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const dateA = new Date(a.Timestamp || a.CreatedAt || a.createdat || 0)
      const dateB = new Date(b.Timestamp || b.CreatedAt || b.createdat || 0)
      return dateB - dateA
    })
  }, [orders])

  const totalPages = Math.max(1, Math.ceil(totalOrders / ADMIN_ORDERS_PAGE_SIZE))
  const hasSearchTerm = String(searchOrderId || '').trim().length > 0
  const summaryOrderCount = hasSearchTerm ? sortedOrders.length : null
  const summaryTotalValue = hasSearchTerm
    ? sortedOrders.reduce((sum, order) => sum + (Number(order.Total || order.total || 0) || 0), 0)
    : null
  const summaryAvgPerOrder =
    hasSearchTerm && summaryOrderCount > 0 ? summaryTotalValue / summaryOrderCount : null

  if (loading && !hasLoadedOrders) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      
      <div className="flex">
        <Sidebar user={user} />
        
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <h1 className="text-2xl font-bold text-gray-900">จัดการออเดอร์</h1>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOrderOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition shadow-sm"
                >
                  <Icon icon="fa-plus-circle" />
                  <span>สร้างออเดอร์</span>
                </button>
                <button
                  type="button"
                  onClick={fetchOrders}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold transition"
                >
                  <Icon icon="fa-sync-alt" className={`text-gray-700 ${loading ? 'animate-spin' : ''}`} />
                  <span className="text-gray-700">{loading ? 'กำลังรีเฟรช...' : 'รีเฟรช'}</span>
                </button>
              </div>
            </div>
            {loading && hasLoadedOrders && (
              <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 shadow-sm">
                <Icon icon="fa-sync-alt" className="mr-2 animate-spin" />
                กำลังอัปเดตข้อมูลตามตัวกรอง...
              </div>
            )}

            {/* Search and Date Range Filters - จัดเรียงให้สวยบนมือถือ */}
            <div className="space-y-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-sm font-bold text-gray-700 mb-2">ค้นหาเลขที่ออเดอร์ / ชื่อลูกค้า / อีเมล</label>
                  <input
                    type="text"
                    value={searchOrderId}
                    onChange={(e) => setSearchOrderId(e.target.value)}
                    placeholder="กรอกเลขที่ออเดอร์, ชื่อลูกค้า หรืออีเมล..."
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">วันที่เริ่มต้น</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      setShowAllDates(false)
                      setCurrentPage(1)
                    }}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">วันที่สิ้นสุด</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value)
                      setShowAllDates(false)
                      setCurrentPage(1)
                    }}
                    min={startDate}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
              </div>
              <DateRangeFilter
                layout="buttonsOnly"
                labelInline
                start={startDate}
                end={endDate}
                onStartChange={(v) => {
                  setStartDate(v)
                  setShowAllDates(false)
                  setCurrentPage(1)
                }}
                onEndChange={(v) => {
                  setEndDate(v)
                  setShowAllDates(false)
                  setCurrentPage(1)
                }}
                showAllDates={showAllDates}
                onShowAllDatesChange={(v) => {
                  setShowAllDates(v)
                  setCurrentPage(1)
                }}
                extraButtons={
                  (searchOrderId || startDate || endDate || showAllDates) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOrderId('')
                        setStartDate('')
                        setEndDate('')
                        setShowAllDates(false)
                        setCurrentPage(1)
                      }}
                      className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold text-gray-700 transition text-sm"
                    >
                      ล้างตัวกรอง
                    </button>
                  )
                }
              />
            </div>

            <div className="mb-5 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700">
              พบออเดอร์: <span className="font-bold">{summaryOrderCount != null ? `${summaryOrderCount} รายการ` : '—'}</span>
              {'  '}มูลค่ารวม: <span className="font-bold text-emerald-600">{summaryTotalValue != null ? `฿${summaryTotalValue.toLocaleString()}` : '—'}</span>
              {'  '}ค่าเฉลี่ยต่อออเดอร์: <span className="font-bold">{summaryAvgPerOrder != null ? `฿${summaryAvgPerOrder.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</span>
            </div>

            {/* Status Filter with Counts */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {['All', 'รอตรวจสอบ', 'กำลังจัดเตรียม', 'จัดส่งแล้ว', 'ยกเลิก'].map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status)
                    setCurrentPage(1)
                    // Clear selections when changing filter
                    if (status !== 'กำลังจัดเตรียม') {
                      setSelectedOrdersForShipping([])
                      setTrackingNumbers({})
                    }
                  }}
                  className={`px-4 py-2 rounded-lg font-bold transition relative ${
                    statusFilter === status
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {status}
                  {orderCounts[status] > 0 && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      statusFilter === status
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}>
                      {orderCounts[status]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Bulk Shipping Controls - Only show when filter is "กำลังจัดเตรียม" */}
            {statusFilter === 'กำลังจัดเตรียม' && sortedOrders.length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                  <h3 className="font-bold text-blue-900">ส่งสินค้าหลายออเดอร์พร้อมกัน</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const { exportShippingReportCsv } = await import('../utils/shippingReportExport')
                          const baseList = selectedOrdersForShipping.length > 0
                            ? sortedOrders.filter((o) => selectedOrdersForShipping.includes(o.ID || o.OrderID))
                            : sortedOrders
                          const list = baseList.filter((o) => isOrderCentralFulfillment(o, productSupplierLookups))
                          if (list.length === 0 && baseList.length > 0) {
                            Swal.fire({
                              icon: 'info',
                              title: 'ไม่มีออเดอร์ส่วนกลางในรายการ',
                              text: 'รายงาน CSV นี้รองรับเฉพาะออเดอร์ที่เป็นสินค้า «ส่วนกลาง» ทุกรายการในใบ'
                            })
                            return
                          }
                          const withPacking = await Promise.all(
                            list.map(async (ord) => {
                              const packing = await packingService.getPacking(ord.ID || ord.OrderID).catch(() => [])
                              return { order: ord, packing }
                            })
                          )
                          const { blob, skippedNoPacking, rowCount } = await exportShippingReportCsv(withPacking)
                          if (rowCount === 0) {
                            Swal.fire({
                              icon: 'warning',
                              title: 'ไม่มีข้อมูลแพ็กในรายงาน',
                              text: 'ออเดอร์ที่เลือกยังไม่มีการบันทึกแพ็กสินค้า (กล่อง) — รายงานจัดส่งจะมีเฉพาะออเดอร์ที่แพ็กแล้ว หนึ่งแถวต่อหนึ่งกล่อง'
                            })
                            return
                          }
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `รายงานจัดส่ง_${new Date().toISOString().slice(0, 10)}.csv`
                          a.click()
                          URL.revokeObjectURL(url)
                          const extra = skippedNoPacking > 0 ? ` ข้าม ${skippedNoPacking} ออเดอร์ที่ยังไม่แพ็ก` : ''
                          Swal.fire({
                            icon: 'success',
                            title: 'ส่งออกรายงานแล้ว',
                            text: `${rowCount} แถว (กล่อง)${extra}`,
                            timer: 2200,
                            showConfirmButton: false
                          })
                        } catch (err) {
                          Swal.fire({ icon: 'error', title: 'ส่งออกไม่สำเร็จ', text: err.message })
                        }
                      }}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition"
                    >
                      ส่งออกรายงาน CSV
                    </button>
                    {selectedOrdersForShipping.length > 0 && (
                      <button
                        onClick={handleBulkShipOrders}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition"
                      >
                        ส่งสินค้า {selectedOrdersForShipping.filter(id => trackingNumbers[id]?.trim()).length} รายการ
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-blue-700 mb-2">
                  เลือกออเดอร์และกรอกเลขพัสดุ แล้วกดปุ่ม &quot;ส่งสินค้า&quot; เพื่อส่งหลายออเดอร์พร้อมกัน หรือกด &quot;ส่งออกรายงาน CSV&quot; — แต่ละแถว = หนึ่งกล่องจากการแพ็กเท่านั้น (ออเดอร์ที่ยังไม่แพ็กจะไม่อยู่ในไฟล์) น้ำหนัก = ค่าที่กรอกในแพ็ก (รวมกล่องแล้ว) หรือถ้าเว้นว่าง = น้ำหนักสินค้า + น้ำหนักกล่องตามไซส์ที่ตั้งใน &quot;ตั้งค่าทั่วไป&quot;
                  <span className="block mt-1 text-amber-800 font-bold">ออเดอร์ที่มีสินค้าซัพพลายภายนอก (ไม่ใช่ส่วนกลางทั้งใบ) จะไม่ถูกรวมในรายการส่งออกนี้ — ใช้พิมพ์รายการสินค้าในแถวออเดอร์แทน</span>
                </p>
              </div>
            )}

            {/* Orders Table */}
            {sortedOrders.length === 0 ? (
              <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                <Icon icon="fa-shopping-bag" className="text-5xl mb-4 opacity-50" />
                <p>ไม่พบออเดอร์</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {statusFilter === 'กำลังจัดเตรียม' && (
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase w-12">
                            <Icon icon="fa-check-square" />
                          </th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ออเดอร์</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ลูกค้า</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">รายการ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ยอดรวม</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">สถานะ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sortedOrders.map((order) => {
                        const orderId = order.ID || order.OrderID
                        const isSelected = selectedOrdersForShipping.includes(orderId)
                        const centralFulfillment = isOrderCentralFulfillment(order, productSupplierLookups)
                        return (
                        <tr key={orderId} className="hover:bg-gray-50">
                          {statusFilter === 'กำลังจัดเตรียม' && (
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleOrderSelection(orderId)}
                                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <span className="font-bold text-gray-900">{orderId}</span>
                            {!centralFulfillment && (
                              <span className="ml-1 inline-block align-middle text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                                ซัพภายนอก
                              </span>
                            )}
                            {(() => {
                              const { supplier, batch } = parseDiscountInfoSupplierMeta(
                                order.DiscountInfo || order.discountInfo
                              )
                              if (!supplier) return null
                              return (
                                <span
                                  className="mt-1 block w-fit text-[10px] font-semibold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded"
                                  title={batch ? `ชุดสั่งซื้อเดียวกัน: ${batch}` : undefined}
                                >
                                  ซัพ: {supplier}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-600">{order.Username || order.UserEmail || order.User || '-'}</div>
                            {order.Username && (order.UserEmail || order.User) && (
                              <div className="text-xs text-gray-400">{order.UserEmail || order.User}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => {
                                const paymentMethodText = order.PaymentMethod === 'credit' 
                                  ? '<span style="color: #16a34a;"><i class="fas fa-wallet"></i> เครดิต</span>'
                                  : '<span style="color: #2563eb;"><i class="fas fa-university"></i> โอนเงิน</span>'
                                const shippingMethodText = order.ShippingMethod === 'pickup'
                                  ? '<span style="color: #ea580c;"><i class="fas fa-store"></i> รับเอง</span>'
                                  : '<span style="color: #9333ea;"><i class="fas fa-truck"></i> จัดส่ง</span>'
                                
                                Swal.fire({
                                  title: 'รายละเอียดออเดอร์',
                                  html: (() => {
                                    const discountInfo = String(order.DiscountInfo || order.discountInfo || '')
                                    const freeItemsMatch = discountInfo.match(/FreeItems:\s*([^|]+)/i)
                                    const freeItemsMap = new Map()
                                    if (freeItemsMatch) {
                                      freeItemsMatch[1]
                                        .trim()
                                        .split(',')
                                        .forEach((itemStr) => {
                                          const match = itemStr.trim().match(/^(.+?):(\d+)$/)
                                          if (match) freeItemsMap.set(match[1].trim(), parseInt(match[2], 10))
                                        })
                                    }
                                    let subtotal = 0
                                    const lines =
                                      order.Items?.map((item, idx) => {
                                        const storedName = String(item.name || '')
                                        const displayLines = formatOrderItemLinesForDisplay(storedName, { hideBundleIds: true })
                                        const title = escapeHtml(displayLines[0] || '-')
                                        const detailLines = displayLines
                                          .slice(1)
                                          .map(
                                            (line) =>
                                              `<div class="text-xs text-gray-600 mt-0.5">${escapeHtml(line)}</div>`
                                          )
                                          .join('')
                                        const productId = item.id || ''
                                        const freeQty = freeQtyForLineItem(freeItemsMap, storedName)
                                        const paidQty = Math.max(0, (item.qty || 0) - freeQty)
                                        const unitPrice = Number(item.price || 0)
                                        const totalPrice = unitPrice * paidQty
                                        subtotal += totalPrice
                                        const qtyText =
                                          freeQty > 0
                                            ? `${item.qty || 0} (ชำระ ${paidQty}, แถม ${freeQty})`
                                            : `${item.qty || 0}`
                                        return `
                                          <div class="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 mb-2 last:mb-0">
                                            <div class="flex items-start justify-between gap-3">
                                              <div class="min-w-0">
                                                <div class="text-xs text-gray-500 mb-1">รายการที่ ${idx + 1}</div>
                                                <div class="font-semibold text-gray-900 leading-tight">
                                                  ${productId ? `<span class="text-gray-500 text-xs font-mono mr-1">${escapeHtml(String(productId))}</span>` : ''}${title}
                                                </div>
                                                ${detailLines}
                                                <div class="text-xs text-gray-700 mt-1.5">
                                                  จำนวน: <b>${qtyText}</b> • ราคา/หน่วย: ฿${unitPrice.toLocaleString()}
                                                </div>
                                              </div>
                                              <div class="text-right shrink-0">
                                                <div class="text-xs text-gray-500">รวมสุทธิ</div>
                                                <div class="font-bold text-emerald-700">฿${totalPrice.toLocaleString()}</div>
                                              </div>
                                            </div>
                                          </div>
                                        `
                                      }).join('') || '<p>ไม่มีรายการ</p>'
                                    const ship = Number(
                                      order['Shipping Cost'] || order.ShippingCost || order.Shipping || order.shipping || 0
                                    )
                                    const couponDisc = Number(order.Discount || order.discount || 0)
                                    const promoDisc = Number(
                                      order.PromotionDiscount || order.promotionDiscount || order.Promotion || 0
                                    )
                                    const grand =
                                      Number(order.Total || order.total || 0) ||
                                      subtotal - couponDisc - promoDisc + ship
                                    return `
                                    <div class="text-left space-y-3 text-gray-800">
                                      <div class="grid grid-cols-2 gap-4 mb-3">
                                        <div>
                                          <span class="text-gray-600 text-sm">วิธีการชำระเงิน</span>
                                          <div class="font-bold mt-1">${paymentMethodText}</div>
                                        </div>
                                        <div>
                                          <span class="text-gray-600 text-sm">วิธีการรับสินค้า</span>
                                          <div class="font-bold mt-1">${shippingMethodText}</div>
                                        </div>
                                      </div>
                                      <div class="border-t pt-2">
                                        <p class="font-bold mb-2">รายการสินค้า</p>
                                        ${lines}
                                      </div>
                                      <div class="border-t pt-3 space-y-1 text-sm bg-gray-50 rounded p-3">
                                        <div class="flex justify-between"><span>ยอดสินค้า (หลังหักแถมตามบรรทัด)</span><span class="font-semibold">฿${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                        ${couponDisc > 0 ? `<div class="flex justify-between text-red-600"><span>ส่วนลด (คูปอง/โค้ด)</span><span>-฿${couponDisc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>` : ''}
                                        ${promoDisc > 0 ? `<div class="flex justify-between text-red-600"><span>ส่วนลดโปรโมชั่น</span><span>-฿${promoDisc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>` : ''}
                                        <div class="flex justify-between"><span>ค่าจัดส่ง</span><span>฿${ship.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                        <div class="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-1"><span>ยอดรวมทั้งสิ้น</span><span>฿${grand.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                      </div>
                                    </div>
                                  `
                                  })(),
                                  width: '640px',
                                  confirmButtonText: 'ปิด'
                                })
                              }}
                              className="text-sm text-emerald-600 hover:text-emerald-700 font-bold underline"
                            >
                              {order.Items?.length || 0} รายการ
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              // Calculate subtotal excluding free items
                              const discountInfo = String(order.DiscountInfo || order.discountInfo || "")
                              let subtotal = 0
                              
                              // Parse free items from DiscountInfo
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
                              
                              // Calculate subtotal excluding free quantities
                              ;(order.Items || []).forEach((item) => {
                                const freeQty = freeQtyForLineItem(freeItemsMap, item.name || '')
                                const paidQty = Math.max(0, (item.qty || 0) - freeQty)
                                subtotal += (item.price || 0) * paidQty
                              })
                              
                              let discount = 0
                              const discountMatch = discountInfo.match(/-(\d+)B/)
                              if (discountMatch) discount = parseInt(discountMatch[1])
                              const shipping = Number(order['Shipping Cost'] || order.ShippingCost || order.Shipping || 0)
                              const calculatedTotal = subtotal - discount + shipping
                              return (
                                <div className="text-sm">
                                  <span className="font-bold text-emerald-600">
                                    ฿{calculatedTotal.toLocaleString()}
                                  </span>
                                  {discount > 0 && (
                                    <div className="text-xs text-red-600">
                                      ส่วนลด: -฿{discount.toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(order.Status)}`}>
                              {order.Status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">{formatDate(order.Timestamp || order.CreatedAt)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-2">
                                {order.Status === 'รอตรวจสอบ' && (
                                  <>
                                    <button
                                      onClick={() =>
                                        centralFulfillment
                                          ? handleUpdateStatus(order.ID || order.OrderID, 'กำลังจัดเตรียม')
                                          : handleUpdateStatus(order.ID || order.OrderID, 'จัดส่งแล้ว')
                                      }
                                      className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition"
                                      title={
                                        centralFulfillment
                                          ? 'ยืนยันไปขั้นจัดเตรียม/แพ็ก (สินค้าส่วนกลาง)'
                                          : 'ยืนยันแล้วไปสถานะจัดส่งแล้วทันที (สินค้าซัพพลายภายนอก)'
                                      }
                                    >
                                      {centralFulfillment ? 'ยืนยัน' : 'ยืนยัน → จัดส่ง'}
                                    </button>
                                    {!centralFulfillment && (
                                      <button
                                        type="button"
                                        onClick={() => handlePrintSupplierPickList(order)}
                                        className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition"
                                        title="พิมพ์รายการสินค้า (รหัส, ชื่อ, ราคา, จำนวน)"
                                      >
                                        <Icon icon="fa-list" className="mr-1" />
                                        พิมพ์รายการ
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleEditOrder(order)}
                                      className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-bold hover:bg-purple-700 transition"
                                    >
                                      <Icon icon="fa-edit" className="mr-1" />
                                      แก้ไข
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(order.ID || order.OrderID, 'ยกเลิก')}
                                      className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition"
                                    >
                                      ยกเลิก
                                    </button>
                                  </>
                                )}
                                {order.Status === 'กำลังจัดเตรียม' && (
                                  <>
                                    {centralFulfillment ? (
                                      <button
                                        onClick={() => setPackingOrder(order)}
                                        className={`px-3 py-1 text-white rounded text-xs font-bold transition ${packedOrderIds.has(order.ID || order.OrderID) ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                                        title={packedOrderIds.has(order.ID || order.OrderID) ? 'ดู/แก้ไขการแพ็ก' : 'แพ็กสินค้าลงกล่อง'}
                                      >
                                        <Icon icon="fa-box-open" className="mr-1" />
                                        {packedOrderIds.has(order.ID || order.OrderID) ? 'แพ็กแล้ว' : 'แพ็กสินค้า'}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handlePrintSupplierPickList(order)}
                                        className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition"
                                      >
                                        <Icon icon="fa-list" className="mr-1" />
                                        พิมพ์รายการ
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleUpdateStatus(order.ID || order.OrderID, 'จัดส่งแล้ว')}
                                      className="px-3 py-1 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 transition"
                                    >
                                      จัดส่ง
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(order.ID || order.OrderID, 'รอตรวจสอบ')}
                                      className="px-3 py-1 bg-gray-500 text-white rounded text-xs font-bold hover:bg-gray-600 transition"
                                      title="ย้อนกลับเป็นรอตรวจสอบ เพื่อยกเลิกหรือแก้ไขได้"
                                    >
                                      <Icon icon="fa-undo" className="mr-1" />
                                      ย้อนกลับสถานะ
                                    </button>
                                  </>
                                )}
                              </div>
                              {order.Status === 'กำลังจัดเตรียม' && isSelected && (
                                <div className="mt-2">
                                  <input
                                    type="text"
                                    placeholder="กรอกเลขที่พัสดุ"
                                    value={trackingNumbers[orderId] || ''}
                                    onChange={(e) => handleTrackingNumberChange(orderId, e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              )}
                              {order.Status === 'จัดส่งแล้ว' && (order.TrackingNo || order.Tracking) && (
                                <span className="text-xs text-gray-600">
                                  <Icon icon="fa-truck" className="mr-1" />
                                  {order.TrackingNo || order.Tracking}
                                </span>
                              )}
                              {order.SlipURL && (
                                <button
                                  onClick={() => window.open(order.SlipURL, '_blank')}
                                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <Icon icon="fa-image" />
                                  ดูสลิป
                                </button>
                              )}
                              {order.Address && (
                                <button
                                  onClick={() => {
                                    Swal.fire({
                                      title: 'ที่อยู่จัดส่ง',
                                      text: order.Address,
                                      confirmButtonText: 'ปิด'
                                    })
                                  }}
                                  className="text-xs text-gray-600 hover:text-gray-700 flex items-center gap-1"
                                >
                                  <Icon icon="fa-map-marker-alt" />
                                  ที่อยู่
                                </button>
                              )}
                              {/* Print Buttons */}
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {!centralFulfillment && (
                                  <button
                                    type="button"
                                    onClick={() => handlePrintSupplierPickList(order)}
                                    className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs font-bold hover:bg-indigo-200 transition"
                                    title="รายการสินค้าสำหรับซัพภายนอก"
                                  >
                                    <Icon icon="fa-list" className="mr-1" />
                                    รายการสินค้า
                                  </button>
                                )}
                                <button
                                  onClick={() => handlePrintLabel(order)}
                                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-bold hover:bg-gray-200 transition"
                                  title="พิมพ์ใบปะหน้า"
                                >
                                  <Icon icon="fa-print" className="mr-1" />
                                  ปะหน้า
                                </button>
                                <button
                                  onClick={() => handlePrintReceipt(order)}
                                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-bold hover:bg-gray-200 transition"
                                  title="พิมพ์ใบเสร็จ"
                                >
                                  <Icon icon="fa-receipt" className="mr-1" />
                                  ใบเสร็จ
                                </button>
                                {(() => {
                                  const orderId = order.ID || order.OrderID
                                  const isRecorded = taxInvoiceRecordedStatus[orderId]?.recorded
                                  return (
                                    <button
                                      onClick={() => handleOpenTaxInvoiceModal(order)}
                                      className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition"
                                      title={isRecorded ? "ใบกำกับภาษี" : "ออกใบกำกับภาษี"}
                                    >
                                      <Icon icon="fa-file-invoice-dollar" className="mr-1" />
                                      {isRecorded ? 'ใบกำกับ' : 'ออกใบกำกับ'}
                                    </button>
                                  )
                                })()}
                              </div>
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {totalOrders > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 px-1">
                <p className="text-sm text-gray-600">
                  แสดง {(currentPage - 1) * ADMIN_ORDERS_PAGE_SIZE + 1}–
                  {Math.min(currentPage * ADMIN_ORDERS_PAGE_SIZE, totalOrders)} จาก {totalOrders} ออเดอร์
                  {totalPages > 1 ? ` · หน้า ${currentPage}/${totalPages}` : ''}
                </p>
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-4 py-2 rounded-lg text-sm font-bold border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      ก่อนหน้า
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-4 py-2 rounded-lg text-sm font-bold border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      ถัดไป
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tax Invoice Modal */}
      {isTaxInvoiceModalOpen && editingOrderForTax && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 text-gray-800 font-normal">
          <div className="absolute inset-0 bg-black bg-opacity-70" onClick={() => setIsTaxInvoiceModalOpen(false)}></div>
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh] font-normal">
            <div className="p-4 bg-emerald-600 text-white font-bold flex justify-between items-center">
              <span><Icon icon="fa-file-invoice-dollar" className="mr-2" />บันทึกข้อมูลภาษี - {editingOrderForTax.ID || editingOrderForTax.OrderID}</span>
              <button onClick={() => setIsTaxInvoiceModalOpen(false)}><Icon icon="fa-times"/></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 font-bold">
                  <Icon icon="fa-info-circle" className="mr-1" />
                  กรอกข้อมูลผู้เสียภาษีและตรวจสอบรายการสินค้า สามารถแก้ไขราคาได้
                </p>
              </div>
              
              {/* Tax Information */}
              <div className="bg-white rounded-lg border p-4 mb-4">
                <h3 className="font-bold text-lg mb-3 text-emerald-800">ข้อมูลผู้เสียภาษี</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">ชื่อบริษัท / ผู้เสียภาษี *</label>
                    <input
                      type="text"
                      value={taxInvoiceForm.taxName}
                      onChange={(e) => setTaxInvoiceForm({...taxInvoiceForm, taxName: e.target.value})}
                      className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="ระบุชื่อตามใบ ภ.พ. 20..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">เลขประจำตัวผู้เสียภาษี *</label>
                    <input
                      type="text"
                      value={taxInvoiceForm.taxId}
                      onChange={(e) => setTaxInvoiceForm({...taxInvoiceForm, taxId: e.target.value})}
                      className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="ระบุเลข 13 หลัก"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">ที่อยู่ (ตามหน้าบัตรหรือ ภ.พ. 20)</label>
                    <textarea
                      value={taxInvoiceForm.taxAddress}
                      onChange={(e) => setTaxInvoiceForm({...taxInvoiceForm, taxAddress: e.target.value})}
                      className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                      rows="3"
                      placeholder="ที่อยู่ (ตามหน้าบัตรหรือ ภ.พ. 20)"
                    />
                  </div>
                </div>
              </div>
              
              {/* Items List */}
              <div className="bg-white rounded-lg border p-4 mb-4">
                <h3 className="font-bold text-lg mb-3 text-emerald-800">รายการสินค้า</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 font-bold">
                      <tr>
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">รหัสสินค้า</th>
                        <th className="p-2 text-left">รายการ</th>
                        <th className="p-2 text-center">จำนวน</th>
                        <th className="p-2 text-right">ราคา/หน่วย</th>
                        <th className="p-2 text-right">รวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {taxInvoiceForm.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2">{idx + 1}</td>
                          <td className="p-2 font-mono text-xs text-gray-600">{(item.id ?? item.name) || '-'}</td>
                          <td className="p-2 font-bold">{getOrderItemDisplayName(item.name)}</td>
                          <td className="p-2 text-center">{item.qty}</td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => {
                                const newItems = [...taxInvoiceForm.items];
                                newItems[idx].price = handleNumberInput(e.target.value, true);
                                newItems[idx].total = newItems[idx].price * newItems[idx].qty;
                                const newSubtotal = newItems.reduce((sum, i) => sum + i.total, 0);
                                const totalDiscount = (taxInvoiceForm.couponDiscount || 0) + (taxInvoiceForm.promotionDiscount || 0) + (taxInvoiceForm.freeItemsValue || 0);
                                const newTotal = newSubtotal - totalDiscount + taxInvoiceForm.shipping;
                                const { vat: newVat, preVat: newPreVat } = calcVatFromTotal(newTotal, vatRate);
                                setTaxInvoiceForm({
                                  ...taxInvoiceForm,
                                  items: newItems,
                                  subtotal: newSubtotal,
                                  total: newTotal,
                                  vat: newVat,
                                  preVat: newPreVat
                                });
                              }}
                              className="w-24 border rounded p-1 text-right focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </td>
                          <td className="p-2 text-right font-bold">{item.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Summary */}
              <div className="bg-white rounded-lg border p-4">
                <h3 className="font-bold text-lg mb-3 text-emerald-800">สรุปยอด</h3>
                <div className="space-y-2">
                  {taxInvoiceForm.couponDiscount > 0 && (
                    <div className="flex justify-between">
                      <span>ส่วนลด (โค้ดส่วนลด):</span>
                      <span className="font-bold text-red-600">-{taxInvoiceForm.couponDiscount.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</span>
                    </div>
                  )}
                  {(taxInvoiceForm.promotionDiscount > 0 || taxInvoiceForm.freeItemsValue > 0) && (
                    <div className="flex justify-between">
                      <span>โปรโมชั่น{taxInvoiceForm.promotionDiscount > 0 && taxInvoiceForm.freeItemsValue > 0 ? ' (ส่วนลด + แถม)' : taxInvoiceForm.promotionDiscount > 0 ? '' : ' (แถมสินค้า)'}:</span>
                      <span className="font-bold text-red-600">-{(taxInvoiceForm.promotionDiscount + taxInvoiceForm.freeItemsValue).toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>รวมเงิน:</span>
                    <span className="font-bold">{taxInvoiceForm.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ค่าขนส่ง:</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={taxInvoiceForm.shipping || ''}
                      onChange={(e) => {
                        const newShipping = handleNumberInput(e.target.value, true);
                        const totalDiscount = (taxInvoiceForm.couponDiscount || 0) + (taxInvoiceForm.promotionDiscount || 0) + (taxInvoiceForm.freeItemsValue || 0);
                        const newTotal = taxInvoiceForm.subtotal - totalDiscount + newShipping;
                        const { vat: newVat, preVat: newPreVat } = calcVatFromTotal(newTotal, vatRate);
                        setTaxInvoiceForm({
                          ...taxInvoiceForm,
                          shipping: newShipping,
                          discount: totalDiscount,
                          total: newTotal,
                          vat: newVat,
                          preVat: newPreVat
                        });
                      }}
                      className="w-32 border rounded p-1 text-right focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span>มูลค่าก่อนภาษี:</span>
                    <span className="font-bold">{taxInvoiceForm.preVat.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ภาษีมูลค่าเพิ่ม {vatRate}%:</span>
                    <span className="font-bold">{taxInvoiceForm.vat.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t-2 border-emerald-600">
                    <span className="font-bold text-lg">ยอดสุทธิ:</span>
                    <span className="font-bold text-lg text-emerald-700">{taxInvoiceForm.total.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 border-t bg-white flex justify-end gap-3">
              <button
                onClick={() => setIsTaxInvoiceModalOpen(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
              >
                ยกเลิก
              </button>
              {taxInvoiceRecordedStatus[editingOrderForTax.ID || editingOrderForTax.OrderID]?.recorded && (
                <button
                  onClick={() => {
                    setIsTaxInvoiceModalOpen(false);
                    handlePrintTaxInvoice();
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
                >
                  <Icon icon="fa-print" className="mr-1" /> สั่งพิมพ์ใบกำกับ
                </button>
              )}
              <button
                onClick={handleSubmitTaxInvoiceData}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition"
              >
                <Icon icon="fa-save" className="mr-1" /> บันทึกข้อมูลภาษี
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">แก้ไขออเดอร์ {editingOrder.ID || editingOrder.OrderID}</h2>
                <button
                  onClick={() => {
                    setEditingOrder(null)
                    setEditingItems([])
                    setEditingShipping(0)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Items List */}
                <div>
                  <h3 className="font-bold text-gray-700 mb-2">รายการสินค้า</h3>
                  <div className="space-y-3">
                    {editingItems.map((item, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4 relative">
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await Swal.fire({
                              icon: 'question',
                              title: 'ลบรายการสินค้า?',
                              text: `ลบ "${getOrderItemDisplayName(item.name)}" ออกจากออเดอร์หรือไม่?`,
                              showCancelButton: true,
                              confirmButtonText: 'ลบ',
                              cancelButtonText: 'ยกเลิก',
                              confirmButtonColor: '#d33',
                              cancelButtonColor: '#6b7280'
                            })
                            if (result.isConfirmed) {
                              setEditingItems(prev => prev.filter((_, i) => i !== index))
                            }
                          }}
                          className="absolute top-3 right-3 p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="ลบรายการ"
                        >
                          <Icon icon="fa-trash" />
                        </button>
                        <div className="mb-2 pr-8">
                            <span className="text-xs text-gray-500">รหัสสินค้า (ใช้กับ QR/แสกน): </span>
                            <span className="text-xs font-mono font-bold text-gray-700">{item.id || item.name || '-'}</span>
                          </div>
                        <div className="mb-2 pr-8">
                          <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อสินค้า</label>
                          <input
                            type="text"
                            value={getOrderItemDisplayName(item.name, { multiline: true })}
                            disabled
                            className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">จำนวน</label>
                            <input
                              type="text"
                              value={item.qty}
                              onChange={async (e) => {
                                const inputValue = e.target.value.trim()
                                
                                // Allow empty input while typing
                                if (inputValue === '') {
                                  const newItems = [...editingItems]
                                  newItems[index].qty = ''
                                  setEditingItems(newItems)
                                  return
                                }
                                
                                // Check if input is a valid number
                                const numValue = handleNumberInput(inputValue, false)
                                if (isNaN(numValue) || numValue < 0) {
                                  return // Don't update if invalid
                                }
                                
                                // If user enters 0, ask for confirmation to remove item
                                if (numValue === 0) {
                                  const result = await Swal.fire({
                                    icon: 'question',
                                    title: 'ต้องการลบสินค้านี้?',
                                    text: `คุณต้องการลบ "${getOrderItemDisplayName(item.name)}" ออกจากออเดอร์หรือไม่?`,
                                    showCancelButton: true,
                                    confirmButtonText: 'ลบสินค้า',
                                    cancelButtonText: 'ยกเลิก',
                                    confirmButtonColor: '#d33',
                                    cancelButtonColor: '#6b7280'
                                  })
                                  
                                  if (result.isConfirmed) {
                                    // Remove item from list
                                    const newItems = editingItems.filter((_, i) => i !== index)
                                    setEditingItems(newItems)
                                  } else {
                                    // Restore previous value
                                    const newItems = [...editingItems]
                                    newItems[index].qty = item.qty || 1
                                    setEditingItems(newItems)
                                  }
                                  return
                                }
                                
                                // Update quantity normally
                                const newItems = [...editingItems]
                                newItems[index].qty = numValue
                                setEditingItems(newItems)
                              }}
                              onBlur={(e) => {
                                // Ensure value is at least 1 when losing focus
                                const newItems = [...editingItems]
                                const currentValue = newItems[index].qty
                                if (!currentValue || currentValue === '' || currentValue < 1) {
                                  newItems[index].qty = 1
                                  setEditingItems(newItems)
                                }
                              }}
                              className="w-full border border-gray-300 rounded-lg p-2"
                              placeholder="กรอกจำนวน"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">ราคาต่อหน่วย</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => {
                                const newItems = [...editingItems]
                                newItems[index].price = handleNumberInput(e.target.value, true)
                                setEditingItems(newItems)
                              }}
                              className="w-full border border-gray-300 rounded-lg p-2"
                            />
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-gray-600">
                          รวม: ฿{(() => {
                            const qty = typeof item.qty === 'string' && item.qty.trim() === '' ? 0 : (parseInt(item.qty) || 0)
                            return (item.price * qty).toLocaleString()
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shipping Cost */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ค่าจัดส่ง</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editingShipping || ''}
                      onChange={(e) => {
                        const val = handleNumberInput(e.target.value, true)
                        setEditingShipping(val)
                      }}
                      className="flex-1 border border-gray-300 rounded-lg p-2"
                      placeholder="กรอกหรือคำนวณจากน้ำหนัก"
                    />
                    <button
                      type="button"
                      onClick={handleCalculateShippingByWeight}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-bold hover:bg-blue-200 transition whitespace-nowrap"
                    >
                      <Icon icon="fa-calculator" className="mr-1" />
                      คำนวณจากน้ำหนัก
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">หรือกำหนดค่าจัดส่งเองในช่องด้านบน</p>
                </div>

                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">ยอดรวมสินค้า:</span>
                    <span className="font-bold">฿{editingItems.reduce((sum, item) => {
                      const qty = typeof item.qty === 'string' && item.qty.trim() === '' ? 0 : (parseInt(item.qty) || 0)
                      return sum + (item.price * qty)
                    }, 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">ค่าจัดส่ง:</span>
                    <span className="font-bold">฿{editingShipping.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-gray-300 pt-2 flex justify-between">
                    <span className="font-bold text-gray-900">ยอดรวมทั้งสิ้น:</span>
                    <span className="font-bold text-emerald-600 text-lg">
                      ฿{(editingItems.reduce((sum, item) => {
                        const qty = typeof item.qty === 'string' && item.qty.trim() === '' ? 0 : (parseInt(item.qty) || 0)
                        return sum + (item.price * qty)
                      }, 0) + editingShipping).toLocaleString()}
                    </span>
                  </div>
                  {editingOrder.Total && (
                    <div className="mt-2 pt-2 border-t border-gray-300">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">ยอดเดิม:</span>
                        <span className="text-gray-600">฿{editingOrder.Total.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="font-bold">ส่วนต่าง:</span>
                        <span className={`font-bold ${(() => {
                          const newTotal = editingItems.reduce((sum, item) => {
                            const qty = typeof item.qty === 'string' && item.qty.trim() === '' ? 0 : (parseInt(item.qty) || 0)
                            return sum + (item.price * qty)
                          }, 0) + editingShipping
                          const diff = newTotal - editingOrder.Total
                          return diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-600'
                        })()}`}>
                          {(() => {
                            const newTotal = editingItems.reduce((sum, item) => {
                              const qty = typeof item.qty === 'string' && item.qty.trim() === '' ? 0 : (parseInt(item.qty) || 0)
                              return sum + (item.price * qty)
                            }, 0) + editingShipping
                            const diff = newTotal - editingOrder.Total
                            return (diff > 0 ? '+' : '') + `฿${diff.toLocaleString()}`
                          })()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEditingOrder(null)
                      setEditingItems([])
                      setEditingShipping(0)
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition"
                  >
                    บันทึกการแก้ไข
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Packing Modal */}
      {packingOrder && (
        <PackingModal
          order={packingOrder}
          onClose={() => setPackingOrder(null)}
          onSaved={() => {
            const orderId = packingOrder?.ID || packingOrder?.OrderID
            if (orderId) {
              setPackedOrderIds((prev) => new Set(prev).add(orderId))
            }
            fetchOrders()
          }}
        />
      )}

      <AdminCreateOrderModal
        open={createOrderOpen}
        onClose={() => setCreateOrderOpen(false)}
        adminUser={user}
        onCreated={fetchOrders}
      />
    </div>
  )
}
