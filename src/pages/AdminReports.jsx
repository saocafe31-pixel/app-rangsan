import { useState, useEffect, useMemo } from 'react'
import Swal from 'sweetalert2'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Header from '../components/common/Header'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Sidebar from '../components/common/Sidebar'
import { orderService } from '../services/orderService'
import { productService } from '../services/productService'
import { printService } from '../services/printService'
import { taxInvoiceService } from '../services/taxInvoiceService'
import { supabase } from '../utils/supabase'
import { toYmd } from '../utils/datePresets'
import { getOrderItemDisplayName, orderItemNameFirstLine } from '../utils/orderBundleLineUtils'

/** สถานะออเดอร์ที่ถือว่าจัดส่งสำเร็จ — ต้องตรงกับค่าในตาราง order */
const ORDER_STATUS_SHIPPED = 'จัดส่งแล้ว'
const ORDER_STATUS_CANCELLED = 'ยกเลิก'

/** ดึงออเดอร์ทุกสถานะในช่วงวันที่ (อิง Timestamp / CreatedAt) ยกเว้นยกเลิก */
const SALES_ORDER_SCOPE_ALL = 'all_in_range'
/** ดึงเฉพาะออเดอร์จัดส่งแล้วในช่วงวันที่ */
const SALES_ORDER_SCOPE_SHIPPED = 'shipped_only_in_range'

/** จัดอันดับสินค้าขายดี */
const TOP_PRODUCTS_RANK_REVENUE = 'revenue'
const TOP_PRODUCTS_RANK_QTY = 'qty'

function isOrderCancelled(order) {
  const status = String(order?.Status || order?.status || '').trim()
  if (status === ORDER_STATUS_CANCELLED) return true
  const lower = status.toLowerCase()
  return lower.includes('ยกเลิก') || lower.includes('cancelled')
}

function filterOrdersByDateRange(orders, range, showAll) {
  if (showAll) return orders || []
  const list = orders || []
  return list.filter((order) => {
    const orderDate = order.Timestamp || order.CreatedAt || order.created_at
    if (!orderDate) return false
    const dateStr = new Date(orderDate).toISOString().split('T')[0]
    return dateStr >= range.start && dateStr <= range.end
  })
}

function applySalesOrderScope(orders, scope) {
  const list = orders || []
  if (scope === SALES_ORDER_SCOPE_SHIPPED) {
    return list.filter((o) => (o.Status || o.status || '') === ORDER_STATUS_SHIPPED)
  }
  return list.filter((o) => !isOrderCancelled(o))
}

function sortTopProducts(list, rankBy) {
  const key = rankBy === TOP_PRODUCTS_RANK_QTY ? 'qty' : 'revenue'
  return [...(list || [])].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0)).slice(0, 20)
}

function getDefaultDateRange() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  return { start: toYmd(firstOfMonth), end: toYmd(today) }
}

function formatCurrency(value) {
  return `฿${Math.round(Number(value || 0)).toLocaleString()}`
}

function formatThaiDateShort(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '-'
  }
}

function getNormalizedName(value) {
  return String(value || '').trim().toLowerCase()
}

export default function AdminReports({ user }) {
  const [loading, setLoading] = useState(false)
  const [reportType, setReportType] = useState('sales') // 'sales' | 'stock' | 'tax'
  const [dateRange, setDateRange] = useState(getDefaultDateRange)
  const [showAllDates, setShowAllDates] = useState(false)
  /** โหมดดึงจากตาราง order: ทุกสถานะในช่วง หรือเฉพาะจัดส่งแล้วในช่วง */
  const [salesOrderScope, setSalesOrderScope] = useState(SALES_ORDER_SCOPE_SHIPPED)
  const [topProductsRankBy, setTopProductsRankBy] = useState(TOP_PRODUCTS_RANK_REVENUE)
  const [skuSearch, setSkuSearch] = useState('')
  const [skuStockFilter, setSkuStockFilter] = useState('all') // all | low | out
  const [skuSort, setSkuSort] = useState({ key: 'soldQtyPeriod', direction: 'desc' })

  // Sales Report Data
  const [salesReport, setSalesReport] = useState({
    periodSales: 0,
    periodOrders: 0,
    periodCompletedOrders: 0,
    totalSales: 0,
    allTimeSales: 0,
    totalOrders: 0,
    totalCompletedOrders: 0,
    averageOrderValue: 0,
    averageOrderValueAllTime: 0,
    totalCost: 0,
    totalShippingCost: 0,
    profit: 0,
    profitMargin: 0,
    salesByPayment: { credit: 0, transfer: 0 },
    salesByStatus: { pending: 0, completed: 0, cancelled: 0 },
    productSalesList: [],
    topProducts: [],
    topCustomers: [],
    dailySales: []
  })

  // Stock Report Data
  const [stockReport, setStockReport] = useState({
    totalStockValue: 0,
    estimatedRetailValue: 0,
    totalStockQuantity: 0,
    totalProducts: 0,
    outOfStockItems: 0,
    lowStockCount: 0,
    lowStockItems: [],
    allProducts: [],
    stockMovements: [],
    stockInValue: 0,
    stockOutValue: 0,
    stockInQuantity: 0,
    stockOutQuantity: 0,
    soldQtyPeriod: 0,
    soldValuePeriod: 0,
    soldQtyAllTime: 0,
    soldValueAllTime: 0,
    netStockMovementQty: 0,
    allSkuRows: []
  })

  const [taxReport, setTaxReport] = useState({
    invoices: [],
    orderMap: {},
    totalCount: 0,
    sumTotal: 0,
    sumVat: 0,
    sumSubtotal: 0
  })

  useEffect(() => {
    if (reportType !== 'tax') return
    fetchTaxReport()
  }, [reportType, dateRange, showAllDates])

  useEffect(() => {
    if (reportType === 'sales') {
      fetchSalesReport()
    } else if (reportType === 'stock') {
      fetchStockReport()
    }
  }, [reportType, dateRange, showAllDates, salesOrderScope])

  const fetchSalesReport = async () => {
    setLoading(true)
    try {
      const orders = await orderService.getAllOrders()

      const filteredOrders = filterOrdersByDateRange(orders, dateRange, showAllDates)
      const reportOrders = applySalesOrderScope(filteredOrders, salesOrderScope)
      const shippedInPeriodOrders = filteredOrders.filter(
        (o) => (o.Status || o.status || '') === ORDER_STATUS_SHIPPED
      )

      const allTimeCompletedOrders = orders.filter(
        (o) => (o.Status || o.status || '') === ORDER_STATUS_SHIPPED
      )

      const totalSales = reportOrders.reduce((sum, order) => {
        return sum + Number(order.Total || order.total || 0)
      }, 0)

      const totalSalesAllTime = allTimeCompletedOrders.reduce((sum, order) => {
        return sum + Number(order.Total || order.total || 0)
      }, 0)

      const totalShippingCost = reportOrders.reduce((sum, order) => {
        return sum + Number(order['Shipping Cost'] || order.ShippingCost || order.Shipping || order.shipping || 0)
      }, 0)

      let totalCost = 0
      try {
        const allProducts = await productService.getProducts(user, 0, 10000, '')
        const productCostMap = new Map()
        allProducts.forEach((product) => {
          if (product.name && product.cost) {
            productCostMap.set(product.name, product.cost)
          }
        })

        reportOrders.forEach((order) => {
          const items = order.Items || []
          items.forEach((item) => {
            const rawName = item.name || ''
            const firstLine = orderItemNameFirstLine(rawName)
            const qty = Number(item.qty || 0)
            const cost =
              productCostMap.get(rawName) || productCostMap.get(firstLine) || productCostMap.get(String(rawName).trim()) || 0
            totalCost += cost * qty
          })
        })
      } catch (error) {
        console.error('Error calculating cost:', error)
      }

      const profit = totalSales - totalCost - totalShippingCost
      const profitMargin = totalSales > 0 ? (profit / totalSales) * 100 : 0
      const averageOrderValue = reportOrders.length > 0 ? totalSales / reportOrders.length : 0
      const averageOrderValueAllTime =
        allTimeCompletedOrders.length > 0 ? totalSalesAllTime / allTimeCompletedOrders.length : 0

      const salesByPayment = { credit: 0, transfer: 0 }
      reportOrders.forEach((order) => {
        const paymentMethod = (order.PaymentMethod || order.paymentmethod || 'transfer').toLowerCase()
        const total = Number(order.Total || order.total || 0)
        if (paymentMethod === 'credit') {
          salesByPayment.credit += total
        } else {
          salesByPayment.transfer += total
        }
      })

      /** สรุปสถานะในช่วงที่เลือก (ทุกสถานะ) — ไม่เปลี่ยนตามโหมดรายงานยอดเงิน */
      const salesByStatus = { pending: 0, completed: 0, cancelled: 0 }
      filteredOrders.forEach((order) => {
        const status = (order.Status || order.status || '').toLowerCase()
        const total = Number(order.Total || order.total || 0)
        if (status.includes('รอ') || status.includes('pending')) {
          salesByStatus.pending += total
        } else if (status.includes('จัดส่ง') || status.includes('completed')) {
          salesByStatus.completed += total
        } else if (status.includes('ยกเลิก') || status.includes('cancelled')) {
          salesByStatus.cancelled += total
        }
      })

      const productSales = new Map()
      reportOrders.forEach((order) => {
        const items = order.Items || []
        items.forEach((item) => {
          const rawName = item.name || ''
          if (!String(rawName).trim()) return
          const aggKey = getNormalizedName(orderItemNameFirstLine(rawName)) || getNormalizedName(rawName)
          const displayName = getOrderItemDisplayName(rawName)
          const current = productSales.get(aggKey) || { name: displayName, qty: 0, revenue: 0 }
          current.name = displayName
          current.qty += Number(item.qty || 0)
          current.revenue += Number(item.price || 0) * Number(item.qty || 0)
          productSales.set(aggKey, current)
        })
      })
      const productSalesList = Array.from(productSales.values())

      const customerSales = new Map()
      reportOrders.forEach((order) => {
        const email = order.UserEmail || order.useremail || ''
        const username = order.Username || order.username || ''
        const customerName = username || email.split('@')[0]
        if (email) {
          const current = customerSales.get(email) || {
            email,
            name: customerName,
            totalSpent: 0,
            orderCount: 0
          }
          current.totalSpent += Number(order.Total || order.total || 0)
          current.orderCount += 1
          customerSales.set(email, current)
        }
      })
      const topCustomers = Array.from(customerSales.values())
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 20)

      const dailySalesMap = new Map()
      reportOrders.forEach((order) => {
        const orderDate = new Date(order.Timestamp || order.CreatedAt || order.created_at)
        const dateKey = orderDate.toISOString().split('T')[0]
        const current = dailySalesMap.get(dateKey) || { date: dateKey, sales: 0, orders: 0 }
        current.sales += Number(order.Total || order.total || 0)
        current.orders += 1
        dailySalesMap.set(dateKey, current)
      })
      const dailySales = Array.from(dailySalesMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date))

      setSalesReport({
        periodSales: totalSales,
        periodOrders: reportOrders.length,
        periodCompletedOrders: shippedInPeriodOrders.length,
        totalSales,
        allTimeSales: totalSalesAllTime,
        totalOrders: orders.length,
        totalCompletedOrders: allTimeCompletedOrders.length,
        averageOrderValue,
        averageOrderValueAllTime,
        totalCost,
        totalShippingCost,
        profit,
        profitMargin,
        salesByPayment,
        salesByStatus,
        productSalesList,
        topCustomers,
        dailySales
      })
    } catch (error) {
      console.error('Error fetching sales report:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลรายงานยอดขายได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchStockReport = async () => {
    setLoading(true)
    try {
      const [allProducts, allOrders] = await Promise.all([
        productService.getProducts(user, 0, 10000, ''),
        orderService.getAllOrders()
      ])

      const shippedAllTime = (allOrders || []).filter((o) => (o.Status || o.status || '') === ORDER_STATUS_SHIPPED)

      const filteredByDate = filterOrdersByDateRange(allOrders, dateRange, showAllDates)
      const periodReportOrders = applySalesOrderScope(filteredByDate, salesOrderScope)

      const salesPeriodByName = new Map()
      const salesAllByName = new Map()
      let soldQtyPeriod = 0
      let soldValuePeriod = 0
      let soldQtyAllTime = 0
      let soldValueAllTime = 0

      shippedAllTime.forEach((order) => {
        ;(order.Items || []).forEach((item) => {
          const nameKey = getNormalizedName(orderItemNameFirstLine(item.name))
          if (!nameKey) return
          const qty = Number(item.qty || 0)
          const revenue = Number(item.price || 0) * qty
          const prev = salesAllByName.get(nameKey) || { qty: 0, value: 0 }
          prev.qty += qty
          prev.value += revenue
          salesAllByName.set(nameKey, prev)
          soldQtyAllTime += qty
          soldValueAllTime += revenue
        })
      })

      periodReportOrders.forEach((order) => {
        ;(order.Items || []).forEach((item) => {
          const nameKey = getNormalizedName(orderItemNameFirstLine(item.name))
          if (!nameKey) return
          const qty = Number(item.qty || 0)
          const revenue = Number(item.price || 0) * qty
          const prev = salesPeriodByName.get(nameKey) || { qty: 0, value: 0 }
          prev.qty += qty
          prev.value += revenue
          salesPeriodByName.set(nameKey, prev)
          soldQtyPeriod += qty
          soldValuePeriod += revenue
        })
      })

      let totalStockValue = 0
      let estimatedRetailValue = 0
      let totalStockQuantity = 0
      const lowStockItems = []
      let outOfStockItems = 0
      const allSkuRows = []

      allProducts.forEach((product) => {
        const stock = Number(product.stock || 0)
        const cost = Number(product.cost || 0)
        const price = Number(product.price || 0)
        const minStock = Number(product.minStock || 0)
        const key = getNormalizedName(product.name)
        const periodSales = salesPeriodByName.get(key) || { qty: 0, value: 0 }
        const allSales = salesAllByName.get(key) || { qty: 0, value: 0 }
        const costValue = stock * cost
        const retailValue = stock * price

        totalStockQuantity += stock
        totalStockValue += costValue
        estimatedRetailValue += retailValue

        if (stock <= 0) outOfStockItems += 1
        if (stock <= minStock && stock > 0) {
          lowStockItems.push({
            id: product.id,
            name: product.name,
            supplier: product.supplier || '-',
            stock,
            minStock,
            cost,
            price,
            value: costValue
          })
        }

        allSkuRows.push({
          id: product.id,
          name: product.name,
          supplier: product.supplier || '-',
          stock,
          minStock,
          soldQtyPeriod: periodSales.qty,
          soldQtyAllTime: allSales.qty,
          costValue,
          retailValue
        })
      })

      let query = supabase.from('stock_logs').select('*').order('timestamp', { ascending: false })
      if (!showAllDates) {
        const startDate = new Date(dateRange.start + 'T00:00:00').toISOString()
        const endDate = new Date(dateRange.end + 'T23:59:59').toISOString()
        query = query.gte('timestamp', startDate).lte('timestamp', endDate)
      }
      const { data: stockLogsData, error: stockLogsError } = await query

      if (stockLogsError) {
        console.error('Error fetching stock logs:', stockLogsError)
        throw stockLogsError
      }

      const stockLogs = stockLogsData || []

      // Calculate stock movements
      let stockInValue = 0
      let stockOutValue = 0
      let stockInQuantity = 0
      let stockOutQuantity = 0

      // Get product costs for calculating values
      const productCostMap = new Map()
      allProducts.forEach(product => {
        if (product.id && product.cost) {
          productCostMap.set(product.id, product.cost)
        }
      })

      const stockMovements = stockLogs.map(log => {
        const quantity = Number(log.quantity || 0)
        const productId = log.productid || log.ProductID || ''
        const cost = productCostMap.get(productId) || 0
        const value = quantity * cost

        if (log.type === 'IN' || log.type === 'ADD' || log.type === 'FROM_PO') {
          stockInQuantity += quantity
          stockInValue += value
        } else if (log.type === 'OUT' || log.type === 'SALE') {
          stockOutQuantity += quantity
          stockOutValue += value
        }

        return {
          id: log.id,
          productName: log.productname || log.ProductName || '',
          type: log.type,
          quantity: quantity,
          cost: cost,
          value: value,
          note: log.note || '',
          timestamp: log.timestamp || log.created_at || ''
        }
      })

      setStockReport({
        totalStockValue,
        estimatedRetailValue,
        totalStockQuantity,
        totalProducts: allProducts.length,
        outOfStockItems,
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.sort((a, b) => a.stock - b.stock),
        allProducts: allProducts,
        stockMovements: stockMovements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
        stockInValue,
        stockOutValue,
        stockInQuantity,
        stockOutQuantity,
        soldQtyPeriod,
        soldValuePeriod,
        soldQtyAllTime,
        soldValueAllTime,
        netStockMovementQty: stockInQuantity - stockOutQuantity,
        allSkuRows: allSkuRows.sort((a, b) => {
          if (b.soldQtyPeriod !== a.soldQtyPeriod) return b.soldQtyPeriod - a.soldQtyPeriod
          return String(a.name || '').localeCompare(String(b.name || ''), 'th')
        })
      })
    } catch (error) {
      console.error('Error fetching stock report:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลรายงานสต็อกได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchTaxReport = async () => {
    setLoading(true)
    try {
      const res = await taxInvoiceService.getTaxInvoicesForAdminReport({
        startDate: dateRange.start,
        endDate: dateRange.end,
        showAllDates
      })
      const invoices = res.success ? res.invoices || [] : []
      const sumTotal = invoices.reduce((s, x) => s + Number(x.total || 0), 0)
      const sumVat = invoices.reduce((s, x) => s + Number(x.vat || 0), 0)
      const sumSubtotal = invoices.reduce((s, x) => s + Number(x.subtotal || 0), 0)

      const orderIds = new Set(invoices.map((inv) => inv.orderId).filter(Boolean))
      const allOrders = await orderService.getAllOrders()
      const orderMap = {}
      allOrders.forEach((order) => {
        const id = order.ID || order.OrderID
        if (id && orderIds.has(id)) orderMap[id] = order
      })

      setTaxReport({
        invoices,
        orderMap,
        totalCount: invoices.length,
        sumTotal,
        sumVat,
        sumSubtotal
      })
    } catch (error) {
      console.error('Error fetching tax invoice report:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงรายงานใบกำกับภาษีได้'
      })
      setTaxReport({ invoices: [], orderMap: {}, totalCount: 0, sumTotal: 0, sumVat: 0, sumSubtotal: 0 })
    } finally {
      setLoading(false)
    }
  }

  const handlePrintTaxInvoiceFromReport = async (inv) => {
    const order = taxReport.orderMap?.[inv.orderId]
    if (!order) {
      Swal.fire({
        icon: 'error',
        title: 'ไม่พบข้อมูลออเดอร์',
        text: 'ไม่สามารถพิมพ์ใบกำกับภาษีได้ เนื่องจากไม่พบออเดอร์ที่เชื่อมกับใบกำกับนี้'
      })
      return
    }
    if (!inv.taxName || !inv.taxId) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'ใบกำกับนี้ไม่มีชื่อผู้เสียภาษีหรือเลขประจำตัวผู้เสียภาษี'
      })
      return
    }

    try {
      Swal.fire({ title: 'กำลังเตรียมพิมพ์...', didOpen: () => Swal.showLoading() })
      try {
        await taxInvoiceService.incrementPrintCount(inv.orderId, user?.email || '', true)
      } catch (error) {
        console.warn('Could not increment print count:', error)
      }

      const taxData = {
        taxName: inv.taxName,
        taxId: inv.taxId,
        taxAddress: inv.taxAddress || '',
        customerPhone: '',
        items: inv.items || [],
        discount: inv.discount || 0,
        shipping: inv.shipping || 0,
        invoiceDate: inv.invoiceDate || new Date()
      }

      await printService.printTaxInvoice(order, taxData)
      await fetchTaxReport()
      Swal.close()
    } catch (error) {
      Swal.close()
      console.error('Error printing tax invoice from report:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถพิมพ์ใบกำกับภาษีได้'
      })
    }
  }

  const exportTaxReport = () => {
    let csv = 'รายงานสรุปใบกำกับภาษี\n'
    csv += `ช่วงเวลา: ${showAllDates ? 'ทั้งหมด' : `${dateRange.start} ถึง ${dateRange.end}`}\n\n`
    csv += 'เลขที่ออเดอร์,อีเมลลูกค้า,ชื่อผู้เสียภาษี,เลขผู้เสียภาษี,ยอดก่อนภาษี,ส่วนลด,ค่าขนส่ง,ภาษี,ยอดรวม,วันที่บิล,ครั้งที่พิมพ์ (แอดมิน)\n'
    taxReport.invoices.forEach((inv) => {
      const row = [
        inv.orderId,
        inv.userEmail,
        inv.taxName,
        inv.taxId,
        inv.subtotal,
        inv.discount,
        inv.shipping,
        inv.vat,
        inv.total,
        inv.invoiceDate || '',
        inv.printCount
      ]
      csv += `${row.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')}\n`
    })
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `รายงานใบกำกับภาษี_${showAllDates ? 'all' : `${dateRange.start}_${dateRange.end}`}.csv`
    link.click()
  }

  const exportSalesReport = () => {
    const scopeLabel =
      salesOrderScope === SALES_ORDER_SCOPE_SHIPPED
        ? `เฉพาะออเดอร์ "${ORDER_STATUS_SHIPPED}" ในช่วง`
        : 'ออเดอร์ทุกสถานะในช่วง (ไม่รวมยกเลิก)'
    // Create CSV content
    let csv = 'รายงานยอดขาย\n'
    csv += `ช่วงเวลา: ${showAllDates ? 'ทั้งหมด' : `${dateRange.start} ถึง ${dateRange.end}`}\n`
    csv += `แหล่งข้อมูล: ${scopeLabel}\n\n`
    csv += 'สรุปยอดขาย\n'
    csv += `ยอดขายรวม,${salesReport.totalSales}\n`
    csv += `จำนวนออเดอร์ (ในรายงาน),${salesReport.periodOrders}\n`
    csv += `ออเดอร์ในระบบทั้งหมด (อ้างอิง),${salesReport.totalOrders}\n`
    csv += `ต้นทุนสินค้า,${salesReport.totalCost}\n`
    csv += `ค่าจัดส่ง,${salesReport.totalShippingCost}\n`
    csv += `กำไร,${salesReport.profit}\n`
    csv += `อัตรากำไร,${salesReport.profitMargin.toFixed(2)}%\n\n`
    csv += 'สินค้าขายดี\n'
    csv += 'ชื่อสินค้า,จำนวนที่ขาย,ยอดขาย\n'
    topProductsDisplayed.forEach((product) => {
      csv += `${product.name},${product.qty},${product.revenue}\n`
    })
    csv += '\nลูกค้าที่ซื้อเยอะสุด\n'
    csv += 'ชื่อลูกค้า,จำนวนออเดอร์,ยอดซื้อรวม\n'
    salesReport.topCustomers.forEach(customer => {
      csv += `${customer.name},${customer.orderCount},${customer.totalSpent}\n`
    })

    // Download CSV
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `รายงานยอดขาย_${dateRange.start}_${dateRange.end}.csv`
    link.click()
  }

  const exportStockReport = () => {
    const orderScopeLine =
      salesOrderScope === SALES_ORDER_SCOPE_SHIPPED
        ? `แหล่ง order (ขายได้ในช่วง): เฉพาะ "${ORDER_STATUS_SHIPPED}"`
        : 'แหล่ง order (ขายได้ในช่วง): ออเดอร์ทุกสถานะในช่วง (ไม่รวมยกเลิก)'
    let csv = 'รายงานการจัดสต็อก\n'
    csv += `ช่วงเวลา: ${showAllDates ? 'ทั้งหมด' : `${dateRange.start} ถึง ${dateRange.end}`}\n`
    csv += `${orderScopeLine}\n\n`
    csv += 'สรุปสต็อก\n'
    csv += `มูลค่าสต็อกคงเหลือ (ต้นทุน),${stockReport.totalStockValue}\n`
    csv += `มูลค่าสต็อกคงเหลือ (ราคาขาย),${stockReport.estimatedRetailValue}\n`
    csv += `จำนวนคงเหลือรวม,${stockReport.totalStockQuantity}\n`
    csv += `จำนวน SKU,${stockReport.totalProducts}\n`
    csv += `สินค้าใกล้หมด,${stockReport.lowStockCount}\n`
    csv += `สินค้าหมดสต็อก,${stockReport.outOfStockItems}\n`
    csv += `ขายได้ (ช่วงที่เลือก) - จำนวน,${stockReport.soldQtyPeriod}\n`
    csv += `ขายได้ (ช่วงที่เลือก) - มูลค่า,${stockReport.soldValuePeriod}\n`
    csv += `ขายได้ (สะสมทั้งหมด) - จำนวน,${stockReport.soldQtyAllTime}\n`
    csv += `ขายได้ (สะสมทั้งหมด) - มูลค่า,${stockReport.soldValueAllTime}\n`
    csv += `รับเข้าสต็อก (จำนวน),${stockReport.stockInQuantity}\n`
    csv += `รับเข้าสต็อก (มูลค่า),${stockReport.stockInValue}\n`
    csv += `เบิกออกสต็อก (จำนวน),${stockReport.stockOutQuantity}\n`
    csv += `เบิกออกสต็อก (มูลค่า),${stockReport.stockOutValue}\n`
    csv += `เคลื่อนไหวสุทธิสต็อก (รับเข้า-เบิกออก),${stockReport.netStockMovementQty}\n\n`

    csv += 'รายการสินค้าทั้งหมด (all SKU)\n'
    csv += 'รหัสสินค้า,ชื่อสินค้า,ซัพพลายเออร์,คงเหลือ,ขายได้(ช่วงที่เลือก),ขายได้(สะสม),มูลค่าคงเหลือ(ต้นทุน),มูลค่าคงเหลือ(ขาย)\n'
    stockReport.allSkuRows.forEach((row) => {
      const vals = [
        row.id || '',
        row.name || '',
        row.supplier || '',
        row.stock || 0,
        row.soldQtyPeriod || 0,
        row.soldQtyAllTime || 0,
        row.costValue || 0,
        row.retailValue || 0
      ]
      csv += `${vals.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')}\n`
    })

    csv += 'สินค้าสต็อกต่ำ\n'
    csv += 'ชื่อสินค้า,สต็อกปัจจุบัน,สต็อกขั้นต่ำ,มูลค่า\n'
    stockReport.lowStockItems.forEach(item => {
      csv += `${item.name},${item.stock},${item.minStock},${item.value}\n`
    })
    csv += '\nประวัติการเคลื่อนไหวสต็อก\n'
    csv += 'วันที่,ชื่อสินค้า,ประเภท,จำนวน,มูลค่า,หมายเหตุ\n'
    stockReport.stockMovements.forEach(movement => {
      const date = new Date(movement.timestamp).toLocaleDateString('th-TH')
      const type = movement.type === 'IN' ? 'รับเข้า' : movement.type === 'OUT' ? 'เบิกออก' : movement.type
      csv += `${date},${movement.productName},${type},${movement.quantity},${movement.value},${movement.note}\n`
    })

    // Download CSV
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `รายงานสต็อก_${dateRange.start}_${dateRange.end}.csv`
    link.click()
  }

  const exportAllProductsReport = () => {
    if (!stockReport.allSkuRows || stockReport.allSkuRows.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'ไม่มีข้อมูลสินค้า',
        text: 'ยังไม่มีรายการสินค้าให้ส่งออก'
      })
      return
    }

    let csv = 'รายงานรายการสินค้าทั้งหมด\n'
    csv += `วันที่ออกรายงาน,${new Date().toISOString()}\n\n`
    csv += 'รหัสสินค้า,ชื่อสินค้า,ซัพพลายเออร์,คงเหลือ,ขายได้(ช่วงที่เลือก),ขายได้(สะสม),มูลค่าคงเหลือ(ต้นทุน),มูลค่าคงเหลือ(ขาย)\n'
    stockReport.allSkuRows.forEach((p) => {
      const row = [
        p.id || '',
        p.name || '',
        p.supplier || '',
        Number(p.stock || 0),
        Number(p.soldQtyPeriod || 0),
        Number(p.soldQtyAllTime || 0),
        Number(p.costValue || 0),
        Number(p.retailValue || 0)
      ]
      csv += `${row.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')}\n`
    })

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `รายการสินค้าทั้งหมด_${toYmd(new Date())}.csv`
    link.click()
  }

  const topProductsDisplayed = useMemo(
    () => sortTopProducts(salesReport.productSalesList, topProductsRankBy),
    [salesReport.productSalesList, topProductsRankBy]
  )

  const skuRowsFilteredSorted = useMemo(() => {
    const q = String(skuSearch || '').trim().toLowerCase()
    const rows = (stockReport.allSkuRows || []).filter((row) => {
      if (skuStockFilter === 'low' && !(Number(row.stock || 0) > 0 && Number(row.stock || 0) <= Number(row.minStock || 0))) {
        return false
      }
      if (skuStockFilter === 'out' && !(Number(row.stock || 0) <= 0)) {
        return false
      }
      if (!q) return true
      const id = String(row.id || '').toLowerCase()
      const name = String(row.name || '').toLowerCase()
      const supplier = String(row.supplier || '').toLowerCase()
      return id.includes(q) || name.includes(q) || supplier.includes(q)
    })

    const dir = skuSort.direction === 'asc' ? 1 : -1
    return rows.sort((a, b) => {
      const key = skuSort.key
      const numKeys = new Set(['stock', 'soldQtyPeriod', 'soldQtyAllTime', 'costValue', 'retailValue'])
      if (numKeys.has(key)) {
        return (Number(a[key] || 0) - Number(b[key] || 0)) * dir
      }
      return String(a[key] || '').localeCompare(String(b[key] || ''), 'th') * dir
    })
  }, [stockReport.allSkuRows, skuSearch, skuStockFilter, skuSort])

  const toggleSkuSort = (key) => {
    setSkuSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      const defaultDesc = new Set(['stock', 'soldQtyPeriod', 'soldQtyAllTime', 'costValue', 'retailValue']).has(key)
      return { key, direction: defaultDesc ? 'desc' : 'asc' }
    })
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      
      <div className="flex">
        <Sidebar user={user} />
        
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">รายงาน</h1>
              <div className="flex flex-wrap gap-2 md:gap-4">
                <button
                  onClick={() => setReportType('sales')}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${
                    reportType === 'sales'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  รายงานยอดขาย
                </button>
                <button
                  onClick={() => setReportType('stock')}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${
                    reportType === 'stock'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  รายงานสต็อก
                </button>
                <button
                  type="button"
                  onClick={() => setReportType('tax')}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${
                    reportType === 'tax'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  สรุปใบกำกับภาษี
                </button>
              </div>
            </div>

            {/* Date Range Selector */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">ช่วงเวลา:</label>
                  <input
                    type="date"
                    value={dateRange.start || ''}
                    onChange={(e) => { setDateRange({ ...dateRange, start: e.target.value }); setShowAllDates(false) }}
                    className="border-2 border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  <span className="text-gray-500">ถึง</span>
                  <input
                    type="date"
                    value={dateRange.end || ''}
                    onChange={(e) => { setDateRange({ ...dateRange, end: e.target.value }); setShowAllDates(false) }}
                    className="border-2 border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <DateRangeFilter
                  layout="buttonsOnly"
                  labelInline
                  start={dateRange.start || ''}
                  end={dateRange.end || ''}
                  onStartChange={(v) => setDateRange((r) => ({ ...r, start: v }))}
                  onEndChange={(v) => setDateRange((r) => ({ ...r, end: v }))}
                  showAllDates={showAllDates}
                  onShowAllDatesChange={setShowAllDates}
                  extraButtons={
                    <>
                      <button
                        type="button"
                        onClick={
                          reportType === 'sales'
                            ? exportSalesReport
                            : reportType === 'stock'
                              ? exportStockReport
                              : exportTaxReport
                        }
                        className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2"
                      >
                        <Icon icon="fa-download" />
                        <span>ส่งออก CSV</span>
                      </button>
                      {reportType === 'stock' && (
                        <button
                          type="button"
                          onClick={exportAllProductsReport}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                        >
                          <Icon icon="fa-file-export" />
                          <span>ออกรายการสินค้าทั้งหมด</span>
                        </button>
                      )}
                    </>
                  }
                />
                {(reportType === 'sales' || reportType === 'stock') && (
                <div className="border-t border-gray-200 pt-4 mt-2 space-y-2">
                  <p className="text-sm font-medium text-gray-800">ข้อมูลจากตาราง order</p>
                  <p className="text-xs text-gray-500">
                    ใช้กับการ์ดและตัวเลข &quot;ขายได้&quot; ทั้งรายงานยอดขายและรายงานสต็อก ตามช่วงเวลาด้านบน (หรือเมื่อเลือกทั้งหมด)
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 flex-1 transition ${
                        salesOrderScope === SALES_ORDER_SCOPE_ALL
                          ? 'border-emerald-500 bg-emerald-50/60'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="salesOrderScope"
                        className="mt-1"
                        checked={salesOrderScope === SALES_ORDER_SCOPE_ALL}
                        onChange={() => setSalesOrderScope(SALES_ORDER_SCOPE_ALL)}
                      />
                      <span>
                        <span className="font-semibold text-gray-900 block">ออเดอร์ทั้งหมดในช่วง</span>
                        <span className="text-xs text-gray-600">
                          รวมทุกสถานะในช่วงวันที่ ยกเว้นออเดอร์ที่ยกเลิก (รอตรวจสอบ, กำลังจัดเตรียม, จัดส่งแล้ว ฯลฯ)
                        </span>
                      </span>
                    </label>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 flex-1 transition ${
                        salesOrderScope === SALES_ORDER_SCOPE_SHIPPED
                          ? 'border-emerald-500 bg-emerald-50/60'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="salesOrderScope"
                        className="mt-1"
                        checked={salesOrderScope === SALES_ORDER_SCOPE_SHIPPED}
                        onChange={() => setSalesOrderScope(SALES_ORDER_SCOPE_SHIPPED)}
                      />
                      <span>
                        <span className="font-semibold text-gray-900 block">
                          {`เฉพาะสถานะ "${ORDER_STATUS_SHIPPED}"`}
                        </span>
                        <span className="text-xs text-gray-600">นับเฉพาะออเดอร์ที่จัดส่งแล้วในช่วงเวลาที่เลือก</span>
                      </span>
                    </label>
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* Sales Report */}
            {reportType === 'sales' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-gray-800">
                  <span className="font-semibold text-emerald-900">การแสดงผลปัจจุบัน: </span>
                  {showAllDates ? 'ทุกวันที่' : `${dateRange.start} ถึง ${dateRange.end}`}
                  {' · '}
                  {salesOrderScope === SALES_ORDER_SCOPE_SHIPPED
                    ? `เฉพาะออเดอร์ "${ORDER_STATUS_SHIPPED}"`
                    : 'ออเดอร์ทุกสถานะในช่วง (ไม่รวมยกเลิก)'}
                </div>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ยอดขายรวม</p>
                        <p className="text-2xl font-semibold text-gray-900">{formatCurrency(salesReport.periodSales)}</p>
                        <p className="text-xs text-gray-500 mt-1">สะสมทั้งหมด {formatCurrency(salesReport.allTimeSales)}</p>
                      </div>
                      <div className="bg-emerald-100 p-4 rounded-xl">
                        <Icon icon="fa-dollar-sign" className="text-emerald-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">จำนวนออเดอร์</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          {salesReport.periodOrders.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {salesOrderScope === SALES_ORDER_SCOPE_SHIPPED
                            ? `ตามตัวเลือก · ทั้งระบบ ${salesReport.totalOrders.toLocaleString()} ออเดอร์`
                            : `ตามตัวเลือก (ไม่รวมยกเลิก) · ทั้งระบบ ${salesReport.totalOrders.toLocaleString()} ออเดอร์`}
                        </p>
                      </div>
                      <div className="bg-blue-100 p-4 rounded-xl">
                        <Icon icon="fa-shopping-bag" className="text-blue-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">กำไรสุทธิ</p>
                        <p className={`text-2xl font-semibold ${salesReport.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {salesReport.profit >= 0 ? '+' : ''}{formatCurrency(salesReport.profit)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {salesReport.profitMargin.toFixed(2)}%
                        </p>
                      </div>
                      <div className={`p-4 rounded-xl ${salesReport.profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                        <Icon icon={salesReport.profit >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} className={`text-2xl ${salesReport.profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ต้นทุนรวม (ช่วงที่เลือก)</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          {formatCurrency(salesReport.totalCost + salesReport.totalShippingCost)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          สินค้า + ค่าจัดส่ง
                        </p>
                      </div>
                      <div className="bg-orange-100 p-4 rounded-xl">
                        <Icon icon="fa-calculator" className="text-orange-600 text-2xl" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">ภาพรวมเชิงบริหาร</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-sm text-gray-600">ออเดอร์จัดส่งแล้วในช่วงที่เลือก</p>
                      <p className="text-xs text-gray-500 mb-1">นับจากช่วงวันที่เดียวกัน ไม่ขึ้นกับตัวเลือกแหล่งข้อมูลด้านบน</p>
                      <p className="text-xl font-bold text-gray-900">{salesReport.periodCompletedOrders.toLocaleString()} รายการ</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-sm text-gray-600">ค่าเฉลี่ยต่อออเดอร์ (ช่วงที่เลือก)</p>
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(salesReport.averageOrderValue)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-sm text-gray-600">ค่าเฉลี่ยต่อออเดอร์ (สะสมทั้งหมด)</p>
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(salesReport.averageOrderValueAllTime)}</p>
                    </div>
                  </div>
                </div>

                {/* Sales by Payment Method */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">ยอดขายตามช่องทางชำระ</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon icon="fa-credit-card" className="text-blue-600 text-xl" />
                          <span className="font-semibold text-gray-700">เครดิต</span>
                        </div>
                        <span className="text-lg font-bold text-blue-600">
                          ฿{salesReport.salesByPayment.credit.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon icon="fa-university" className="text-green-600 text-xl" />
                          <span className="font-semibold text-gray-700">โอนเงิน</span>
                        </div>
                        <span className="text-lg font-bold text-green-600">
                          ฿{salesReport.salesByPayment.transfer.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Products */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold text-gray-900">สินค้าขายดี 20 อันดับ</h2>
                    <div className="flex items-center gap-2">
                      <label htmlFor="topProductsRankBy" className="text-sm text-gray-600 whitespace-nowrap">
                        จัดอันดับตาม
                      </label>
                      <select
                        id="topProductsRankBy"
                        value={topProductsRankBy}
                        onChange={(e) => setTopProductsRankBy(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      >
                        <option value={TOP_PRODUCTS_RANK_REVENUE}>ยอดขาย</option>
                        <option value={TOP_PRODUCTS_RANK_QTY}>จำนวนขาย</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">อันดับ</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อสินค้า</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">จำนวนที่ขาย</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">ยอดขาย</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProductsDisplayed.map((product, index) => (
                          <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">{index + 1}</td>
                            <td className="py-3 px-4 font-medium">{product.name}</td>
                            <td className="py-3 px-4 text-right">{product.qty.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                              ฿{product.revenue.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Customers */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">ลูกค้าที่ซื้อเยอะสุด 20 อันดับ</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">อันดับ</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อลูกค้า</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">จำนวนออเดอร์</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">ยอดซื้อรวม</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesReport.topCustomers.map((customer, index) => (
                          <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">{index + 1}</td>
                            <td className="py-3 px-4 font-medium">{customer.name}</td>
                            <td className="py-3 px-4 text-right">{customer.orderCount}</td>
                            <td className="py-3 px-4 text-right font-semibold text-blue-600">
                              ฿{customer.totalSpent.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Stock Report */}
            {reportType === 'stock' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-100 rounded-xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-600">Dashboard สรุปรายงานสต็อก</p>
                      <p className="text-base font-bold text-gray-800">
                        ช่วงข้อมูล: {showAllDates ? 'ทั้งหมด (สะสมทั้งระบบ)' : `${dateRange.start} ถึง ${dateRange.end}`}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        ตาราง order (คอลัมน์ขายได้ในช่วง):{' '}
                        {salesOrderScope === SALES_ORDER_SCOPE_SHIPPED
                          ? `เฉพาะ "${ORDER_STATUS_SHIPPED}"`
                          : 'ออเดอร์ทุกสถานะในช่วง (ไม่รวมยกเลิก)'}
                        {` · คอลัมน์ "ขายได้ (สะสม)" = เฉพาะออเดอร์จัดส่งแล้วทั้งระบบ`}
                      </p>
                    </div>
                    <div className="text-sm text-gray-700">
                      เคลื่อนไหวสุทธิ: <span className={`font-bold ${stockReport.netStockMovementQty >= 0 ? 'text-green-700' : 'text-red-700'}`}>{stockReport.netStockMovementQty.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">มูลค่าสต็อกคงเหลือ (ต้นทุน)</p>
                        <p className="text-2xl font-semibold text-gray-900">{formatCurrency(stockReport.totalStockValue)}</p>
                      </div>
                      <div className="bg-indigo-100 p-4 rounded-xl">
                        <Icon icon="fa-warehouse" className="text-indigo-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">มูลค่าสต็อกคงเหลือ (ราคาขาย)</p>
                        <p className="text-2xl font-semibold text-gray-900">{formatCurrency(stockReport.estimatedRetailValue)}</p>
                      </div>
                      <div className="bg-emerald-100 p-4 rounded-xl">
                        <Icon icon="fa-tags" className="text-emerald-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">จำนวนคงเหลือรวม + SKU</p>
                        <p className="text-2xl font-semibold text-gray-900">{stockReport.totalStockQuantity.toLocaleString()}</p>
                        <p className="text-xs text-gray-500 mt-1">{stockReport.totalProducts.toLocaleString()} รายการสินค้า</p>
                      </div>
                      <div className="bg-blue-100 p-4 rounded-xl">
                        <Icon icon="fa-box" className="text-blue-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">สินค้าใกล้หมด / หมดสต็อก</p>
                        <p className="text-2xl font-semibold text-amber-600">
                          {stockReport.lowStockCount.toLocaleString()} / <span className="text-red-600">{stockReport.outOfStockItems.toLocaleString()}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">ใกล้หมด / หมดสต็อก</p>
                      </div>
                      <div className="bg-amber-100 p-4 rounded-xl">
                        <Icon icon="fa-exclamation-triangle" className="text-amber-600 text-2xl" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ขายได้ (ช่วงที่เลือก)</p>
                        <p className="text-2xl font-semibold text-emerald-700">{stockReport.soldQtyPeriod.toLocaleString()}</p>
                        <p className="text-xs text-gray-500 mt-1">{formatCurrency(stockReport.soldValuePeriod)}</p>
                      </div>
                      <div className="bg-emerald-100 p-4 rounded-xl">
                        <Icon icon="fa-chart-line" className="text-emerald-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ขายได้ (สะสมทั้งหมด)</p>
                        <p className="text-2xl font-semibold text-blue-700">{stockReport.soldQtyAllTime.toLocaleString()}</p>
                        <p className="text-xs text-gray-500 mt-1">{formatCurrency(stockReport.soldValueAllTime)}</p>
                      </div>
                      <div className="bg-blue-100 p-4 rounded-xl">
                        <Icon icon="fa-layer-group" className="text-blue-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">รับเข้า - เบิกออก (จำนวน)</p>
                        <p className={`text-2xl font-semibold ${stockReport.netStockMovementQty >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {stockReport.netStockMovementQty >= 0 ? '+' : ''}{stockReport.netStockMovementQty.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          รับเข้า {stockReport.stockInQuantity.toLocaleString()} | เบิกออก {stockReport.stockOutQuantity.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-gray-100 p-4 rounded-xl">
                        <Icon icon="fa-exchange-alt" className="text-gray-700 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">รับเข้า / เบิกออก (มูลค่า)</p>
                        <p className="text-xl font-semibold text-gray-900">{formatCurrency(stockReport.stockInValue)} / {formatCurrency(stockReport.stockOutValue)}</p>
                        <p className="text-xs text-gray-500 mt-1">ต้นทุนอ้างอิงจาก cost</p>
                      </div>
                      <div className="bg-purple-100 p-4 rounded-xl">
                        <Icon icon="fa-money-check-alt" className="text-purple-600 text-2xl" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">รายการสินค้าทั้งหมด (all SKU)</h2>
                  <div className="mb-4 flex flex-col md:flex-row gap-3">
                    <input
                      type="text"
                      value={skuSearch}
                      onChange={(e) => setSkuSearch(e.target.value)}
                      placeholder="ค้นหารหัสสินค้า / ชื่อสินค้า / ซัพพลายเออร์..."
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                    <select
                      value={skuStockFilter}
                      onChange={(e) => setSkuStockFilter(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="all">แสดงทั้งหมด</option>
                      <option value="low">เฉพาะสินค้าใกล้หมด</option>
                      <option value="out">เฉพาะสินค้าหมดสต็อก</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setSkuSearch('')
                        setSkuStockFilter('all')
                        setSkuSort({ key: 'soldQtyPeriod', direction: 'desc' })
                      }}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 text-gray-700"
                    >
                      รีเซ็ตตัวกรอง/การเรียง
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    พบ {skuRowsFilteredSorted.length.toLocaleString()} จาก {stockReport.allSkuRows.length.toLocaleString()} SKU
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px]">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-3 font-semibold text-gray-700">
                            <button type="button" onClick={() => toggleSkuSort('id')} className="inline-flex items-center gap-1 hover:text-emerald-700">
                              รหัสสินค้า {skuSort.key === 'id' ? (skuSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </button>
                          </th>
                          <th className="text-left py-3 px-3 font-semibold text-gray-700">
                            <button type="button" onClick={() => toggleSkuSort('name')} className="inline-flex items-center gap-1 hover:text-emerald-700">
                              ชื่อสินค้า {skuSort.key === 'name' ? (skuSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </button>
                          </th>
                          <th className="text-left py-3 px-3 font-semibold text-gray-700">
                            <button type="button" onClick={() => toggleSkuSort('supplier')} className="inline-flex items-center gap-1 hover:text-emerald-700">
                              ซัพพลายเออร์ {skuSort.key === 'supplier' ? (skuSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </button>
                          </th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">
                            <button type="button" onClick={() => toggleSkuSort('stock')} className="inline-flex items-center gap-1 hover:text-emerald-700">
                              คงเหลือ {skuSort.key === 'stock' ? (skuSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </button>
                          </th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">
                            <button type="button" onClick={() => toggleSkuSort('soldQtyPeriod')} className="inline-flex items-center gap-1 hover:text-emerald-700">
                              ขายได้ (ช่วงที่เลือก) {skuSort.key === 'soldQtyPeriod' ? (skuSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </button>
                          </th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">
                            <button type="button" onClick={() => toggleSkuSort('soldQtyAllTime')} className="inline-flex items-center gap-1 hover:text-emerald-700">
                              ขายได้ (สะสม) {skuSort.key === 'soldQtyAllTime' ? (skuSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </button>
                          </th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">
                            <button type="button" onClick={() => toggleSkuSort('costValue')} className="inline-flex items-center gap-1 hover:text-emerald-700">
                              มูลค่าคงเหลือ (ต้นทุน) {skuSort.key === 'costValue' ? (skuSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </button>
                          </th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">
                            <button type="button" onClick={() => toggleSkuSort('retailValue')} className="inline-flex items-center gap-1 hover:text-emerald-700">
                              มูลค่าคงเหลือ (ขาย) {skuSort.key === 'retailValue' ? (skuSort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {skuRowsFilteredSorted.map((row, index) => (
                          <tr key={`${row.id || row.name}-${index}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2.5 px-3 text-xs text-gray-600">{row.id || '-'}</td>
                            <td className="py-2.5 px-3 font-medium text-gray-900">{row.name || '-'}</td>
                            <td className="py-2.5 px-3 text-gray-700">{row.supplier || '-'}</td>
                            <td className="py-2.5 px-3 text-right">{Number(row.stock || 0).toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">{Number(row.soldQtyPeriod || 0).toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right text-blue-700 font-semibold">{Number(row.soldQtyAllTime || 0).toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right">{formatCurrency(row.costValue)}</td>
                            <td className="py-2.5 px-3 text-right">{formatCurrency(row.retailValue)}</td>
                          </tr>
                        ))}
                        {skuRowsFilteredSorted.length === 0 && (
                          <tr>
                            <td colSpan="8" className="py-8 text-center text-gray-500">
                              ไม่พบข้อมูลตามตัวกรอง
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Low Stock Items */}
                {stockReport.lowStockItems.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">สินค้าสต็อกต่ำ</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อสินค้า</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">สต็อกปัจจุบัน</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">สต็อกขั้นต่ำ</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">มูลค่า</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockReport.lowStockItems.map((item, index) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 font-medium">{item.name}</td>
                              <td className="py-3 px-4 text-right text-red-600 font-semibold">{item.stock}</td>
                              <td className="py-3 px-4 text-right">{item.minStock}</td>
                              <td className="py-3 px-4 text-right">฿{item.value.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Stock Movements */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">ประวัติการเคลื่อนไหวสต็อก</h2>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">วันที่</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อสินค้า</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">ประเภท</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">จำนวน</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">มูลค่า</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockReport.stockMovements.length > 0 ? (
                          stockReport.stockMovements.map((movement, index) => {
                            const date = new Date(movement.timestamp).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                            const typeLabel = movement.type === 'IN' ? 'รับเข้า' : 
                                             movement.type === 'OUT' ? 'เบิกออก' : 
                                             movement.type === 'ADD' ? 'เพิ่ม' :
                                             movement.type === 'FROM_PO' ? 'จาก PO' :
                                             movement.type === 'SALE' ? 'ขาย' : movement.type
                            const typeColor = movement.type === 'IN' || movement.type === 'ADD' || movement.type === 'FROM_PO' 
                              ? 'text-green-600' 
                              : 'text-red-600'
                            
                            return (
                              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-3 px-4 text-sm">{date}</td>
                                <td className="py-3 px-4 font-medium">{movement.productName}</td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`font-semibold ${typeColor}`}>{typeLabel}</span>
                                </td>
                                <td className="py-3 px-4 text-right">{movement.quantity.toLocaleString()}</td>
                                <td className="py-3 px-4 text-right">฿{movement.value.toLocaleString()}</td>
                                <td className="py-3 px-4 text-sm text-gray-600">{movement.note}</td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" className="py-8 text-center text-gray-500">
                              ไม่มีข้อมูลการเคลื่อนไหวสต็อกในช่วงเวลาที่เลือก
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {reportType === 'tax' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-gray-800">
                  <span className="font-semibold text-blue-900">รายงานสรุปใบกำกับภาษี: </span>
                  {showAllDates ? 'ทุกวันที่ (จากวันที่บันทึกบนบิลหรือวันที่สร้างแถว)' : `${dateRange.start} ถึง ${dateRange.end}`}
                  <span className="text-gray-600"> — ข้อมูลจากตาราง tax_invoices</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">จำนวนใบกำกับ</p>
                    <p className="text-2xl font-semibold text-gray-900">{taxReport.totalCount.toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">ยอดรวม (ใบกำกับ)</p>
                    <p className="text-2xl font-semibold text-emerald-700">{formatCurrency(taxReport.sumTotal)}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">ภาษีรวม</p>
                    <p className="text-2xl font-semibold text-gray-900">{formatCurrency(taxReport.sumVat)}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">ยอดก่อนภาษีรวม</p>
                    <p className="text-2xl font-semibold text-gray-900">{formatCurrency(taxReport.sumSubtotal)}</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">รายการใบกำกับภาษี</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px]">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-3 font-semibold text-gray-700">เลขที่ออเดอร์</th>
                          <th className="text-left py-3 px-3 font-semibold text-gray-700">อีเมลลูกค้า</th>
                          <th className="text-left py-3 px-3 font-semibold text-gray-700">ชื่อผู้เสียภาษี</th>
                          <th className="text-left py-3 px-3 font-semibold text-gray-700">เลขผู้เสียภาษี</th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">ยอดก่อนภาษี</th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">ภาษี</th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">ยอดรวม</th>
                          <th className="text-left py-3 px-3 font-semibold text-gray-700">วันที่บิล</th>
                          <th className="text-center py-3 px-3 font-semibold text-gray-700">ดู / พิมพ์</th>
                          <th className="text-right py-3 px-3 font-semibold text-gray-700">พิมพ์ (แอดมิน)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxReport.invoices.map((inv, invIdx) => (
                          <tr key={`${inv.orderId}-${invIdx}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2.5 px-3 font-mono text-sm">{inv.orderId}</td>
                            <td className="py-2.5 px-3 text-sm text-gray-700 max-w-[200px] truncate" title={inv.userEmail}>
                              {inv.userEmail || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-sm">{inv.taxName || '-'}</td>
                            <td className="py-2.5 px-3 text-sm font-mono">{inv.taxId || '-'}</td>
                            <td className="py-2.5 px-3 text-right text-sm">{formatCurrency(inv.subtotal)}</td>
                            <td className="py-2.5 px-3 text-right text-sm">{formatCurrency(inv.vat)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">{formatCurrency(inv.total)}</td>
                            <td className="py-2.5 px-3 text-sm text-gray-600">{formatThaiDateShort(inv.invoiceDate)}</td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePrintTaxInvoiceFromReport(inv)}
                                disabled={!taxReport.orderMap?.[inv.orderId]}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                title={
                                  taxReport.orderMap?.[inv.orderId]
                                    ? 'เปิดหน้าต่างพิมพ์ใบกำกับภาษี'
                                    : 'ไม่พบข้อมูลออเดอร์ที่เชื่อมกับใบกำกับนี้'
                                }
                              >
                                <Icon icon="fa-print" />
                                <span>ดู / พิมพ์</span>
                              </button>
                            </td>
                            <td className="py-2.5 px-3 text-right text-sm">{Number(inv.printCount || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                        {taxReport.invoices.length === 0 && (
                          <tr>
                            <td colSpan="10" className="py-10 text-center text-gray-500">
                              ไม่มีใบกำกับภาษีในช่วงที่เลือก
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
