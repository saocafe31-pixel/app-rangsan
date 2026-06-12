import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Header from '../components/common/Header'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Sidebar from '../components/common/Sidebar'
import { orderService } from '../services/orderService'
import { productService } from '../services/productService'
import {
  buildChartDataForSupplier,
  computeFilteredKpis,
  computeSupplierBreakdown
} from '../utils/dashboardSupplierStats'
import { getOrderItemDisplayName, orderItemNameFirstLine } from '../utils/orderBundleLineUtils'

const TOP_RANK_QTY = 'qty'
const TOP_RANK_REVENUE = 'revenue'

function normalizeProductKey(value) {
  return String(value || '').trim().toLowerCase()
}

function rankBadgeClass(index) {
  if (index === 0) return 'bg-amber-400 text-amber-950 shadow-sm shadow-amber-200'
  if (index === 1) return 'bg-slate-300 text-slate-800'
  if (index === 2) return 'bg-orange-300 text-orange-900'
  return 'bg-emerald-100 text-emerald-700'
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export default function AdminDashboard({ user }) {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalCost: 0,
    totalShippingCost: 0,
    profit: 0,
    profitMargin: 0,
    totalOrders: 0,
    totalOrdersValue: 0,
    pendingOrders: 0,
    pendingOrdersValue: 0,
    completedOrders: 0,
    completedOrdersValue: 0,
    inventoryValue: 0,
    salesByPayment: {
      credit: 0,
      transfer: 0
    }
  })
  const [topProducts, setTopProducts] = useState([])
  const [topProductsRankBy, setTopProductsRankBy] = useState(TOP_RANK_QTY)
  const [topCustomers, setTopCustomers] = useState([])
  const [discountStats, setDiscountStats] = useState({
    totalDiscountAmount: 0,
    totalDiscountUsage: 0,
    uniqueDiscountUsers: 0
  })
  const [promotionStats, setPromotionStats] = useState({
    totalPromotionAmount: 0,
    totalPromotionUsage: 0,
    uniquePromotionUsers: 0
  })
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: []
  })
  const [chartPeriod, setChartPeriod] = useState('daily') // 'daily', 'monthly', 'yearly'
  const [loading, setLoading] = useState(true)
  const [hasLoadedStats, setHasLoadedStats] = useState(false)
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  const [showAllDates, setShowAllDates] = useState(false)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [dashboardSupplierFilter, setDashboardSupplierFilter] = useState('all')
  const [analyticsRaw, setAnalyticsRaw] = useState({ completedOrders: [], allProducts: [] })
  const [supplierBreakdownRows, setSupplierBreakdownRows] = useState([])

  useEffect(() => {
    fetchStats()
  }, [dateRange, chartPeriod, showAllDates])

  const kpiStats = useMemo(() => {
    const f = computeFilteredKpis(
      analyticsRaw.completedOrders,
      analyticsRaw.allProducts,
      dashboardSupplierFilter
    )
    if (!f) return stats
    return { ...stats, ...f }
  }, [stats, analyticsRaw, dashboardSupplierFilter])

  const chartDisplay = useMemo(() => {
    if (dashboardSupplierFilter === 'all') return chartData
    return buildChartDataForSupplier(
      analyticsRaw.completedOrders,
      dashboardSupplierFilter,
      analyticsRaw.allProducts,
      chartPeriod,
      dateRange
    )
  }, [chartData, analyticsRaw, dashboardSupplierFilter, chartPeriod, dateRange])

  const topProductsDisplayed = useMemo(() => {
    const key = topProductsRankBy === TOP_RANK_REVENUE ? 'revenue' : 'qty'
    return [...topProducts].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0)).slice(0, 10)
  }, [topProducts, topProductsRankBy])

  const topProductsMaxMetric = useMemo(() => {
    if (!topProductsDisplayed.length) return 1
    const key = topProductsRankBy === TOP_RANK_REVENUE ? 'revenue' : 'qty'
    return Math.max(...topProductsDisplayed.map((p) => Number(p[key] || 0)), 1)
  }, [topProductsDisplayed, topProductsRankBy])

  const topCustomersMaxSpent = useMemo(() => {
    if (!topCustomers.length) return 1
    return Math.max(...topCustomers.map((c) => Number(c.totalSpent || 0)), 1)
  }, [topCustomers])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const orders = await orderService.getAllOrders()
      
      console.log('All orders fetched:', orders.length)
      console.log('Sample order:', orders[0])
      
      // Filter orders by date range (หรือทั้งหมดถ้าเลือก "ทั้งหมด")
      const filteredOrders = showAllDates
        ? orders
        : orders.filter(order => {
            const orderDate = order.Timestamp || order.CreatedAt || order.created_at
            if (!orderDate) return false
            const dateStr = new Date(orderDate).toISOString().split('T')[0]
            return dateStr >= dateRange.start && dateStr <= dateRange.end
          })

      console.log('Filtered orders:', filteredOrders.length)

      // Get only completed orders for sales calculations
      const completedOrders = filteredOrders.filter(o => {
        const status = o.Status || o.status || ''
        return status === 'จัดส่งแล้ว'
      })
      
      // Debug: Check all completed orders for DiscountInfo
      console.log('Total completed orders:', completedOrders.length)
      const ordersWithDiscountInfo = completedOrders.filter(o => {
        const discountInfo = String(o.DiscountInfo || o.discountinfo || '')
        const discount = Number(o.Discount || o.discount || 0)
        return discountInfo.trim() !== '' || discount > 0
      })
      console.log('Orders with DiscountInfo or discount:', ordersWithDiscountInfo.length)
      if (ordersWithDiscountInfo.length > 0) {
        console.log('Sample orders with discount:', ordersWithDiscountInfo.slice(0, 3).map(o => ({
          id: o.ID || o.OrderID,
          discountInfo: String(o.DiscountInfo || o.discountinfo || ''),
          discount: Number(o.Discount || o.discount || 0),
          status: o.Status || o.status
        })))
      }

      // Calculate total sales (only completed orders)
      const totalSales = completedOrders.reduce((sum, order) => {
        const total = Number(order.Total || order.total || 0)
        return sum + total
      }, 0)

      // Calculate total shipping cost
      const totalShippingCost = completedOrders.reduce((sum, order) => {
        const shipping = Number(order['Shipping Cost'] || order.Shipping || order.shipping || 0)
        return sum + shipping
      }, 0)

      // Calculate total cost and profit (ใช้รายการสินค้าครั้งเดียวกับ inventory / แดชบอร์ดซัพ)
      let totalCost = 0
      let allProducts = []
      try {
        allProducts = await productService.getProducts(user, 0, 10000, '')
        const productCostMap = new Map()
        allProducts.forEach((product) => {
          if (product.name && product.cost !== undefined && product.cost !== null) {
            productCostMap.set(product.name, product.cost)
          }
        })

        completedOrders.forEach((order) => {
          const items = order.Items || []
          items.forEach((item) => {
            const productName = item.name || ''
            const qty = Number(item.qty || 0)
            const cost = productCostMap.get(productName) || 0
            totalCost += cost * qty
          })
        })
      } catch (error) {
        console.error('Error fetching products for cost calculation:', error)
      }

      // Calculate profit and profit margin
      // Profit = Total Sales - Product Cost - Shipping Cost
      const profit = totalSales - totalCost - totalShippingCost
      const profitMargin = totalSales > 0 ? (profit / totalSales) * 100 : 0

      // Calculate sales by payment method
      const salesByPayment = {
        credit: 0,
        transfer: 0
      }
      completedOrders.forEach(order => {
        const paymentMethod = (order.PaymentMethod || order.paymentmethod || 'transfer').toLowerCase()
        const total = Number(order.Total || order.total || 0)
        if (paymentMethod === 'credit') {
          salesByPayment.credit += total
        } else {
          salesByPayment.transfer += total
        }
      })

      // Count orders by status and calculate values
      const totalOrders = filteredOrders.length
      const totalOrdersValue = filteredOrders.reduce((sum, order) => {
        return sum + Number(order.Total || order.total || 0)
      }, 0)

      const pendingOrdersList = filteredOrders.filter(o => {
        const status = o.Status || o.status || ''
        return status === 'รอตรวจสอบ'
      })
      const pendingOrders = pendingOrdersList.length
      const pendingOrdersValue = pendingOrdersList.reduce((sum, order) => {
        return sum + Number(order.Total || order.total || 0)
      }, 0)
      
      const completedOrdersCount = completedOrders.length
      const completedOrdersValue = completedOrders.reduce((sum, order) => {
        return sum + Number(order.Total || order.total || 0)
      }, 0)

      let inventoryValue = 0
      try {
        inventoryValue = allProducts.reduce((sum, product) => {
          const stock = Number(product.stock || 0)
          const cost = Number(product.cost || 0)
          return sum + stock * cost
        }, 0)
      } catch (error) {
        console.error('Error calculating inventory value:', error)
      }

      // สถานะระบบตอนนี้: จำนวนสินค้าสต็อกต่ำ
      try {
        const count = await productService.getLowStockCount()
        setLowStockCount(count || 0)
      } catch (e) {
        console.error('Error fetching low stock count:', e)
        setLowStockCount(0)
      }

      // Calculate top products (aggregate by display name — ไม่รวม BUNDLE_IDS ในชื่อ)
      const productSales = new Map()
      completedOrders.forEach((order) => {
        const items = order.Items || []
        items.forEach((item) => {
          const rawName = item.name || ''
          if (!String(rawName).trim()) return
          const aggKey =
            normalizeProductKey(orderItemNameFirstLine(rawName)) || normalizeProductKey(rawName)
          const displayName = getOrderItemDisplayName(rawName)
          const current = productSales.get(aggKey) || { name: displayName, qty: 0, revenue: 0 }
          current.name = displayName
          current.qty += Number(item.qty || 0)
          current.revenue += Number(item.price || 0) * Number(item.qty || 0)
          productSales.set(aggKey, current)
        })
      })
      const topProductsList = Array.from(productSales.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10)

      // Calculate top customers
      const customerSales = new Map()
      completedOrders.forEach(order => {
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
      const topCustomersList = Array.from(customerSales.values())
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10)

      // Calculate discount statistics (coupon codes) - only from completed orders
      // Check DiscountInfo for "Code:" pattern to identify coupon usage
      // Debug: Log all completed orders with DiscountInfo
      console.log('All completed orders with DiscountInfo:', completedOrders.map(o => ({
        id: o.ID || o.OrderID,
        discountInfo: o.DiscountInfo || o.discountinfo || '',
        discount: o.Discount || o.discount || 0,
        status: o.Status || o.status
      })).filter(o => o.discountInfo || o.discount > 0))
      
      const discountOrders = completedOrders.filter(o => {
        const discountInfo = String(o.DiscountInfo || o.discountinfo || '')
        // ถ้ามี DiscountInfo ที่มี "Code:" แสดงว่าเป็นโค้ดส่วนลด
        const hasCode = discountInfo && discountInfo.trim() !== '' && discountInfo.includes('Code:')
        if (hasCode) {
          console.log('Found coupon order:', {
            id: o.ID || o.OrderID,
            discountInfo: discountInfo,
            discount: o.Discount || o.discount || 0
          })
        }
        return hasCode
      })
      const totalDiscountAmount = discountOrders.reduce((sum, order) => {
        const discountInfo = String(order.DiscountInfo || order.discountinfo || '')
        // ดึงจำนวนเงินจาก "Code: XXX (-XXB)"
        const match = discountInfo.match(/Code:.*?\(-(\d+(?:\.\d+)?)B?\)/i)
        if (match && match[1]) {
          return sum + parseFloat(match[1])
        }
        // ถ้าไม่สามารถดึงได้ ให้ใช้ discount ทั้งหมด
        const discount = Number(order.Discount || order.discount || 0)
        return sum + discount
      }, 0)
      const discountUsers = new Set()
      discountOrders.forEach(order => {
        const email = order.UserEmail || order.useremail || ''
        if (email) discountUsers.add(email)
      })

      // Calculate promotion statistics - only from completed orders
      // Check DiscountInfo for "Promotion:" pattern to identify promotion usage
      const promotionOrders = completedOrders.filter(o => {
        const discountInfo = String(o.DiscountInfo || o.discountinfo || '')
        // ถ้ามี DiscountInfo ที่มี "Promotion:" แสดงว่าเป็นโปรโมชั่น
        // หรือถ้ามี FreeItems แต่ไม่มี Code: แสดงว่าเป็นโปรโมชั่น
        const hasCode = discountInfo.includes('Code:')
        const hasPromotion = discountInfo.includes('Promotion:')
        const hasFreeItems = discountInfo.includes('FreeItems:')
        const isPromotion = discountInfo && discountInfo.trim() !== '' && (hasPromotion || (hasFreeItems && !hasCode))
        if (isPromotion) {
          console.log('Found promotion order:', {
            id: o.ID || o.OrderID,
            discountInfo: discountInfo,
            discount: o.Discount || o.discount || 0,
            hasPromotion,
            hasFreeItems,
            hasCode
          })
        }
        return isPromotion
      })
      const totalPromotionAmount = promotionOrders.reduce((sum, order) => {
        const discountInfo = String(order.DiscountInfo || order.discountinfo || '')
        let promotionDiscount = 0
        let freeItemsValue = 0
        
        // ดึง promotion discount จาก "Promotion: -XXB"
        if (discountInfo.includes('Promotion:')) {
          const match = discountInfo.match(/Promotion:\s*-?(\d+(?:\.\d+)?)B?/i)
          if (match && match[1]) {
            promotionDiscount = parseFloat(match[1])
          }
        }
        
        // ดึง free items value จาก "FreeItems: itemName:freeQty,..."
        const freeItemsMatch = discountInfo.match(/FreeItems:\s*([^|]+)/i)
        if (freeItemsMatch) {
          const freeItemsStr = freeItemsMatch[1].trim()
          const freeItemsList = freeItemsStr.split(',')
          
          // คำนวณมูลค่าสินค้าแถมจาก order items
          const items = order.Items || []
          freeItemsList.forEach(itemStr => {
            const itemMatch = itemStr.trim().match(/^(.+?):(\d+)$/)
            if (itemMatch) {
              const itemName = itemMatch[1].trim()
              const freeQty = parseInt(itemMatch[2])
              // หาราคาสินค้าจาก order items
              const orderItem = items.find(i => (i.name || '').trim() === itemName)
              if (orderItem && freeQty > 0) {
                const itemPrice = Number(orderItem.price || 0)
                freeItemsValue += (itemPrice * freeQty)
              }
            }
          })
        }
        
        // ถ้าไม่มี promotion discount แต่มี free items ให้ใช้ discount ทั้งหมด
        if (promotionDiscount === 0 && freeItemsValue === 0) {
          const discount = Number(order.Discount || order.discount || 0)
          if (discount > 0 && !discountInfo.includes('Code:')) {
            promotionDiscount = discount
          }
        }
        
        return sum + promotionDiscount + freeItemsValue
      }, 0)
      const promotionUsers = new Set()
      promotionOrders.forEach(order => {
        const email = order.UserEmail || order.useremail || ''
        if (email) promotionUsers.add(email)
      })

      console.log('Stats calculated:', {
        totalSales,
        totalOrders,
        pendingOrders,
        completedOrdersCount,
        salesByPayment,
        topProducts: topProductsList.length,
        topCustomers: topCustomersList.length,
        discountStats: {
          totalDiscountAmount,
          totalDiscountUsage: discountOrders.length,
          uniqueDiscountUsers: discountUsers.size
        },
        promotionStats: {
          totalPromotionAmount,
          totalPromotionUsage: promotionOrders.length,
          uniquePromotionUsers: promotionUsers.size
        }
      })
      console.log('Sample discount orders:', discountOrders.slice(0, 2).map(o => ({
        id: o.ID || o.OrderID,
        discountInfo: o.DiscountInfo || o.discountinfo,
        discount: o.Discount || o.discount
      })))
      console.log('Sample promotion orders:', promotionOrders.slice(0, 2).map(o => ({
        id: o.ID || o.OrderID,
        discountInfo: o.DiscountInfo || o.discountinfo,
        discount: o.Discount || o.discount
      })))

      setStats({
        totalSales,
        totalCost,
        totalShippingCost,
        profit,
        profitMargin,
        totalOrders,
        totalOrdersValue,
        pendingOrders,
        pendingOrdersValue,
        completedOrders: completedOrdersCount,
        completedOrdersValue,
        inventoryValue,
        salesByPayment
      })
      setTopProducts(topProductsList)
      setTopCustomers(topCustomersList)
      setDiscountStats({
        totalDiscountAmount,
        totalDiscountUsage: discountOrders.length,
        uniqueDiscountUsers: discountUsers.size
      })
      setPromotionStats({
        totalPromotionAmount,
        totalPromotionUsage: promotionOrders.length,
        uniquePromotionUsers: promotionUsers.size
      })

      const chartDataResult = calculateChartData(completedOrders, chartPeriod, dateRange)
      setChartData(chartDataResult)

      setAnalyticsRaw({ completedOrders, allProducts })
      setSupplierBreakdownRows(computeSupplierBreakdown(completedOrders, allProducts))
    } catch (error) {
      console.error('Error fetching stats:', error)
      // Set default values on error
      setStats({
        totalSales: 0,
        totalCost: 0,
        totalShippingCost: 0,
        profit: 0,
        profitMargin: 0,
        totalOrders: 0,
        totalOrdersValue: 0,
        pendingOrders: 0,
        pendingOrdersValue: 0,
        completedOrders: 0,
        completedOrdersValue: 0,
        inventoryValue: 0,
        salesByPayment: { credit: 0, transfer: 0 }
      })
      setChartData({ labels: [], datasets: [] })
      setAnalyticsRaw({ completedOrders: [], allProducts: [] })
      setSupplierBreakdownRows([])
    } finally {
      setLoading(false)
      setHasLoadedStats(true)
    }
  }

  // Calculate chart data based on period (daily, monthly, yearly)
  const calculateChartData = (orders, period, dateRange) => {
    if (!orders || orders.length === 0) {
      return {
        labels: [],
        datasets: []
      }
    }

    const salesMap = new Map()
    const startDate = new Date(dateRange.start)
    const endDate = new Date(dateRange.end)

    // Initialize all periods with 0
    const periods = []
    let currentDate = new Date(startDate)

    if (period === 'daily') {
      while (currentDate <= endDate) {
        const key = currentDate.toISOString().split('T')[0]
        periods.push(key)
        salesMap.set(key, 0)
        currentDate.setDate(currentDate.getDate() + 1)
      }
    } else if (period === 'monthly') {
      while (currentDate <= endDate) {
        const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
        if (!periods.includes(key)) {
          periods.push(key)
          salesMap.set(key, 0)
        }
        currentDate.setMonth(currentDate.getMonth() + 1)
      }
    } else if (period === 'yearly') {
      while (currentDate <= endDate) {
        const key = String(currentDate.getFullYear())
        if (!periods.includes(key)) {
          periods.push(key)
          salesMap.set(key, 0)
        }
        currentDate.setFullYear(currentDate.getFullYear() + 1)
      }
    }

    // Aggregate sales by period
    orders.forEach(order => {
      const orderDate = new Date(order.Timestamp || order.CreatedAt || order.created_at)
      if (!orderDate || isNaN(orderDate.getTime())) return

      let key = ''
      if (period === 'daily') {
        key = orderDate.toISOString().split('T')[0]
      } else if (period === 'monthly') {
        key = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`
      } else if (period === 'yearly') {
        key = String(orderDate.getFullYear())
      }

      if (salesMap.has(key)) {
        const current = salesMap.get(key)
        salesMap.set(key, current + Number(order.Total || order.total || 0))
      }
    })

    // Format labels
    const labels = periods.map(key => {
      if (period === 'daily') {
        const date = new Date(key)
        return `${date.getDate()}/${date.getMonth() + 1}`
      } else if (period === 'monthly') {
        const [year, month] = key.split('-')
        const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
        return `${monthNames[parseInt(month) - 1]} ${year}`
      } else if (period === 'yearly') {
        return key
      }
      return key
    })

    const salesData = periods.map(key => salesMap.get(key) || 0)

    return {
      labels,
      datasets: [
        {
          label: 'ยอดขาย (บาท)',
          data: salesData,
          borderColor: 'rgb(16, 185, 129)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: 'rgb(16, 185, 129)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }
      ]
    }
  }

  if (loading && !hasLoadedStats) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      
      <div className="flex">
        <Sidebar user={user} />
        
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
                {loading && hasLoadedStats && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                    <Icon icon="fa-sync-alt" className="animate-spin" />
                    กำลังอัปเดตข้อมูล...
                  </span>
                )}
              </div>
              {/* สถานะระบบตอนนี้ */}
              <div className="flex flex-wrap gap-3 mb-4 p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                <span className="text-sm font-medium text-gray-600">สถานะระบบตอนนี้:</span>
                <Link to="/admin/orders" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition">
                  <Icon icon="fa-shopping-bag" className="text-amber-600" />
                  <span className="font-semibold">รอตรวจสอบ {stats.pendingOrders} ออเดอร์</span>
                </Link>
                {lowStockCount > 0 && (
                  <Link to="/admin/stock-alert" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 transition">
                    <Icon icon="fa-exclamation-triangle" className="text-red-600" />
                    <span className="font-semibold">สินค้าสต็อกต่ำ {lowStockCount} รายการ</span>
                  </Link>
                )}
                {stats.pendingOrders === 0 && lowStockCount === 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-800 border border-green-200">
                    <Icon icon="fa-check-circle" className="text-green-600" />
                    <span className="font-medium">ไม่มีรายการรอดำเนินการ</span>
                  </span>
                )}
              </div>
              <DateRangeFilter
                start={dateRange.start || ''}
                end={dateRange.end || ''}
                onStartChange={(v) => setDateRange((r) => ({ ...r, start: v }))}
                onEndChange={(v) => setDateRange((r) => ({ ...r, end: v }))}
                showAllDates={showAllDates}
                onShowAllDatesChange={setShowAllDates}
              />

              <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  กรองยอด KPI ตามซัพพลายเออร์ (นับจากรายการสินค้าในออเดอร์ &quot;จัดส่งแล้ว&quot;)
                </label>
                <select
                  value={dashboardSupplierFilter}
                  onChange={(e) => setDashboardSupplierFilter(e.target.value)}
                  className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="all">ทั้งหมด — รวมทุกซัพพลายเออร์</option>
                  {supplierBreakdownRows.map((row) => (
                    <option key={row.supplier} value={row.supplier}>
                      {row.supplier} (ยอดบรรทัด ฿{Math.round(row.revenue).toLocaleString()})
                    </option>
                  ))}
                </select>
                {dashboardSupplierFilter !== 'all' && (
                  <p className="text-xs text-blue-800 mt-2 leading-relaxed">
                    การ์ดยอดขาย กำไร จัดส่งแล้ว ค่าขนส่ง ต้นทุน และกราฟด้านล่าง จะคิดเฉพาะรายการสินค้าที่อยู่ในซัพพลายเออร์ &quot;{dashboardSupplierFilter}&quot; เท่านั้น
                  </p>
                )}
              </div>

              {supplierBreakdownRows.length > 0 && (
                <div className="mt-4 overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
                  <p className="px-3 py-2 text-sm font-bold text-gray-800 border-b bg-gray-50">
                    สรุปยอดแยกตามซัพพลายเออร์ (ออเดอร์จัดส่งแล้วในช่วงวันที่)
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-600 border-b">
                        <th className="px-3 py-2">ซัพพลายเออร์</th>
                        <th className="px-3 py-2 text-right">ยอดขาย (บรรทัด)</th>
                        <th className="px-3 py-2 text-right">ต้นทุน</th>
                        <th className="px-3 py-2 text-right">ค่าขนส่ง (สัดส่วน)</th>
                        <th className="px-3 py-2 text-right">กำไรโดยประมาณ</th>
                        <th className="px-3 py-2 text-right">จำนวนออเดอร์</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierBreakdownRows.map((r) => (
                        <tr key={r.supplier} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{r.supplier}</td>
                          <td className="px-3 py-2 text-right">฿{Math.round(r.revenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">฿{Math.round(r.cost).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">฿{Math.round(r.shippingAllocated).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                            ฿{Math.round(r.profit).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right">{r.orderCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Main Sales Card - Featured */}
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-md border border-emerald-400 p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-xs font-medium mb-0.5 uppercase tracking-wide">
                    ยอดขายรวม{dashboardSupplierFilter !== 'all' ? ` (${dashboardSupplierFilter})` : ''}
                  </p>
                  <p className="text-xl font-semibold text-white mb-0.5">
                    ฿{kpiStats.totalSales.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`px-1.5 py-0.5 rounded-full ${kpiStats.profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                        <span className={`text-xs font-medium ${kpiStats.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {kpiStats.profit >= 0 ? '+' : ''}฿{kpiStats.profit.toLocaleString()}
                        </span>
                      </div>
                      <span className={`text-xs font-medium ${kpiStats.profitMargin >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                        {kpiStats.profitMargin >= 0 ? '+' : ''}{kpiStats.profitMargin.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="bg-white bg-opacity-20 p-3 rounded-lg backdrop-blur-sm">
                  <Icon icon="fa-dollar-sign" className="text-white text-2xl" />
                </div>
              </div>
            </div>

            {/* Secondary Stats Cards - 8 Cards in 4x2 Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Row 1: Orders */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5 font-medium">ออเดอร์ทั้งหมด</p>
                    <p className="text-xl font-semibold text-gray-900 mb-0.5">
                      {stats.totalOrders}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      ฿{stats.totalOrdersValue.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <Icon icon="fa-shopping-bag" className="text-blue-600 text-xl" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5 font-medium">รอตรวจสอบ</p>
                    <p className="text-xl font-semibold text-yellow-600 mb-0.5">
                      {stats.pendingOrders}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      ฿{stats.pendingOrdersValue.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-yellow-100 p-3 rounded-lg">
                    <Icon icon="fa-clock" className="text-yellow-600 text-xl" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5 font-medium">จัดส่งแล้ว</p>
                    <p className="text-xl font-semibold text-green-600 mb-0.5">
                      {kpiStats.completedOrders}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      ฿{kpiStats.completedOrdersValue.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-lg">
                    <Icon icon="fa-check-circle" className="text-green-600 text-xl" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5 font-medium">มูลค่าสินค้าคงคลัง</p>
                    <p className="text-xl font-semibold text-indigo-600 mb-0.5">
                      ฿{Math.round(stats.inventoryValue).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      สต็อก × ต้นทุน
                    </p>
                  </div>
                  <div className="bg-indigo-100 p-3 rounded-lg">
                    <Icon icon="fa-warehouse" className="text-indigo-600 text-xl" />
                  </div>
                </div>
              </div>

              {/* Row 2: Costs */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5 font-medium">ค่าจัดส่งรวม</p>
                    <p className="text-xl font-semibold text-purple-600 mb-0.5">
                      ฿{kpiStats.totalShippingCost.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      รวมทั้งหมด
                    </p>
                  </div>
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <Icon icon="fa-truck" className="text-purple-600 text-xl" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5 font-medium">ต้นทุนสินค้า</p>
                    <p className="text-xl font-semibold text-orange-600 mb-0.5">
                      ฿{kpiStats.totalCost.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      ที่ขายไปแล้ว
                    </p>
                  </div>
                  <div className="bg-orange-100 p-3 rounded-lg">
                    <Icon icon="fa-box" className="text-orange-600 text-xl" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5 font-medium">ต้นทุนรวม</p>
                    <p className="text-xl font-semibold text-red-600 mb-0.5">
                      ฿{(kpiStats.totalCost + kpiStats.totalShippingCost).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      สินค้า + ค่าจัดส่ง
                    </p>
                  </div>
                  <div className="bg-red-100 p-3 rounded-lg">
                    <Icon icon="fa-calculator" className="text-red-600 text-xl" />
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-sm border-2 border-green-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-700 mb-0.5 font-medium">กำไรสุทธิ</p>
                    <p className={`text-xl font-semibold mb-0.5 ${kpiStats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {kpiStats.profit >= 0 ? '+' : ''}฿{kpiStats.profit.toLocaleString()}
                    </p>
                    <p className={`text-xs font-medium ${kpiStats.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {kpiStats.profitMargin >= 0 ? '+' : ''}{kpiStats.profitMargin.toFixed(2)}%
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg ${kpiStats.profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Icon icon={kpiStats.profit >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} className={`text-xl ${kpiStats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                  </div>
                </div>
              </div>
            </div>

            {/* Sales Trend Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-base font-bold text-gray-900">แนวโน้มยอดขาย</h2>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setChartPeriod('daily')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                      chartPeriod === 'daily'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    รายวัน
                  </button>
                  <button
                    onClick={() => setChartPeriod('monthly')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                      chartPeriod === 'monthly'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    รายเดือน
                  </button>
                  <button
                    onClick={() => setChartPeriod('yearly')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                      chartPeriod === 'yearly'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    รายปี
                  </button>
                </div>
              </div>
              {chartDisplay.labels.length > 0 ? (
                <div className="h-64">
                  <Line
                    data={chartDisplay}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: true,
                          position: 'top',
                        },
                        tooltip: {
                          mode: 'index',
                          intersect: false,
                          callbacks: {
                            label: function(context) {
                              return `ยอดขาย: ฿${context.parsed.y.toLocaleString()}`
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: function(value) {
                              return '฿' + value.toLocaleString()
                            }
                          },
                          grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                          }
                        },
                        x: {
                          grid: {
                            display: false
                          }
                        }
                      },
                      interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-gray-500">
                  <p>ยังไม่มีข้อมูลยอดขายในช่วงเวลาที่เลือก</p>
                </div>
              )}
            </div>

            {/* Payment Method Breakdown and Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">ยอดขายตามช่องทางชำระ</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-credit-card" className="text-blue-600 text-xl" />
                      <span className="font-semibold text-gray-700">เครดิต</span>
                    </div>
                    <span className="text-lg font-bold text-blue-600">
                      ฿{kpiStats.salesByPayment.credit.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-university" className="text-green-600 text-xl" />
                      <span className="font-semibold text-gray-700">โอนเงิน</span>
                    </div>
                    <span className="text-lg font-bold text-green-600">
                      ฿{kpiStats.salesByPayment.transfer.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Discount Statistics (Coupon Codes) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">สถิติโค้ดส่วนลด</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-tag" className="text-purple-600 text-xl" />
                      <span className="font-semibold text-gray-700">ยอดส่วนลดรวม</span>
                    </div>
                    <span className="text-lg font-bold text-purple-600">
                      ฿{discountStats.totalDiscountAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-shopping-cart" className="text-orange-600 text-xl" />
                      <span className="font-semibold text-gray-700">จำนวนครั้งที่ใช้</span>
                    </div>
                    <span className="text-lg font-bold text-orange-600">
                      {discountStats.totalDiscountUsage} ครั้ง
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-pink-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-users" className="text-pink-600 text-xl" />
                      <span className="font-semibold text-gray-700">จำนวนผู้ใช้</span>
                    </div>
                    <span className="text-lg font-bold text-pink-600">
                      {discountStats.uniqueDiscountUsers} คน
                    </span>
                  </div>
                </div>
              </div>

              {/* Promotion Statistics */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">สถิติโปรโมชั่น</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-gift" className="text-emerald-600 text-xl" />
                      <span className="font-semibold text-gray-700">ยอดส่วนลดรวม</span>
                    </div>
                    <span className="text-lg font-bold text-emerald-600">
                      ฿{promotionStats.totalPromotionAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-teal-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-shopping-cart" className="text-teal-600 text-xl" />
                      <span className="font-semibold text-gray-700">จำนวนครั้งที่ใช้</span>
                    </div>
                    <span className="text-lg font-bold text-teal-600">
                      {promotionStats.totalPromotionUsage} ครั้ง
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-cyan-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon icon="fa-users" className="text-cyan-600 text-xl" />
                      <span className="font-semibold text-gray-700">จำนวนผู้ใช้</span>
                    </div>
                    <span className="text-lg font-bold text-cyan-600">
                      {promotionStats.uniquePromotionUsers} คน
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Products and Customers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Top Products */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-4 -mx-6 px-6 -mt-2 pt-2 bg-gradient-to-r from-emerald-50/80 to-transparent">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                      <Icon icon="fa-trophy" className="text-lg" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-gray-900">สินค้าขายดี</h2>
                      <p className="text-xs text-gray-500">10 อันดับ · ออเดอร์จัดส่งแล้ว</p>
                    </div>
                  </div>
                  <select
                    id="dashboardTopRankBy"
                    value={topProductsRankBy}
                    onChange={(e) => setTopProductsRankBy(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none shrink-0"
                  >
                    <option value={TOP_RANK_QTY}>จัดอันดับ: จำนวนขาย</option>
                    <option value={TOP_RANK_REVENUE}>จัดอันดับ: ยอดขาย</option>
                  </select>
                </div>
                <div className="space-y-2.5">
                  {topProductsDisplayed.length > 0 ? (
                    topProductsDisplayed.map((product, index) => {
                      const metricKey = topProductsRankBy === TOP_RANK_REVENUE ? 'revenue' : 'qty'
                      const barPct = Math.round(
                        (Number(product[metricKey] || 0) / topProductsMaxMetric) * 100
                      )
                      return (
                        <div
                          key={`${product.name}-${index}`}
                          className={`rounded-xl border p-3 transition hover:shadow-sm ${
                            index < 3
                              ? 'border-emerald-200 bg-emerald-50/50'
                              : 'border-gray-100 bg-gray-50/80'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rankBadgeClass(index)}`}
                            >
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                                {product.name}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                                <span>{Number(product.qty || 0).toLocaleString()} ชิ้น</span>
                                <span className="font-semibold text-emerald-700">
                                  ฿{Number(product.revenue || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-10 text-center text-gray-500 text-sm">
                      <Icon icon="fa-box-open" className="text-2xl text-gray-300 mb-2 block mx-auto" />
                      ยังไม่มีข้อมูลสินค้าขายดีในช่วงนี้
                    </div>
                  )}
                </div>
              </div>

              {/* Top Customers */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-4 -mx-6 px-6 -mt-2 pt-2 bg-gradient-to-r from-blue-50/80 to-transparent">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                    <Icon icon="fa-users" className="text-lg" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">ลูกค้ายอดซื้อสูงสุด</h2>
                    <p className="text-xs text-gray-500">10 อันดับ · ออเดอร์จัดส่งแล้ว</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {topCustomers.length > 0 ? (
                    topCustomers.map((customer, index) => {
                      const spent = Number(customer.totalSpent || 0)
                      const barPct = Math.round((spent / topCustomersMaxSpent) * 100)
                      return (
                        <div
                          key={`${customer.email || customer.name}-${index}`}
                          className={`rounded-xl border p-3 transition hover:shadow-sm ${
                            index < 3
                              ? 'border-blue-200 bg-blue-50/50'
                              : 'border-gray-100 bg-gray-50/80'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rankBadgeClass(index)}`}
                            >
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">{customer.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {Number(customer.orderCount || 0).toLocaleString()} ออเดอร์
                              </p>
                              <p className="text-sm font-bold text-blue-700 mt-1">฿{spent.toLocaleString()}</p>
                              <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-10 text-center text-gray-500 text-sm">
                      <Icon icon="fa-user-slash" className="text-2xl text-gray-300 mb-2 block mx-auto" />
                      ยังไม่มีข้อมูลลูกค้าในช่วงนี้
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions - ลิงก์ไปหน้าต่างๆ ตามเมนูระบบปัจจุบัน */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">เข้าถึงหน้าต่างๆ ของระบบ</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                <Link
                  to="/admin/orders"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-shopping-bag" className="text-emerald-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">จัดการออเดอร์</span>
                  {stats.pendingOrders > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                      {stats.pendingOrders > 99 ? '99+' : stats.pendingOrders}
                    </span>
                  )}
                </Link>
                <Link
                  to="/admin/stock"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-warehouse" className="text-emerald-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">จัดการสต็อก</span>
                </Link>
                <Link
                  to="/admin/stock-alert"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-exclamation-triangle" className="text-amber-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">แจ้งเตือนสต็อกต่ำ</span>
                  {lowStockCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                      {lowStockCount > 99 ? '99+' : lowStockCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/admin/stock/qr-codes"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-qrcode" className="text-emerald-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">QR สินค้า</span>
                </Link>
                <Link
                  to="/admin/stock-logs"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-history" className="text-emerald-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">ประวัติสต็อก</span>
                </Link>
                <Link
                  to="/admin/purchase-order"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-shopping-cart" className="text-emerald-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">สั่งซื้อ (PO)</span>
                </Link>
                <Link
                  to="/admin/credit-approval"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-wallet" className="text-emerald-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">อนุมัติเครดิต</span>
                </Link>
                <Link
                  to="/admin/reports"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-chart-bar" className="text-emerald-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">รายงาน</span>
                </Link>
                <Link
                  to="/admin/settings"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition"
                >
                  <Icon icon="fa-cog" className="text-emerald-600 text-xl shrink-0" />
                  <span className="font-semibold text-gray-900">ตั้งค่า</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
