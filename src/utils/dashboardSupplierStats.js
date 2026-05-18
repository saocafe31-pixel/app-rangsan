import { buildProductSupplierLookups, getItemSupplier } from './orderSupplierUtils'

function productCostByName(allProducts) {
  const m = new Map()
  ;(allProducts || []).forEach((p) => {
    const n = (p.name || '').trim()
    if (n) m.set(n, Number(p.cost) || 0)
  })
  return m
}

export function computeSupplierBreakdown(completedOrders, allProducts) {
  const lookups = buildProductSupplierLookups(allProducts)
  const costMap = productCostByName(allProducts)
  const bySup = new Map()
  for (const order of completedOrders || []) {
    const oid = order.ID || order.OrderID
    const shipping = Number(order['Shipping Cost'] || order.Shipping || order.shipping || 0)
    const items = order.Items || []
    const orderSub = items.reduce(
      (s, i) => s + Number(i.price || 0) * Number(i.qty || 0),
      0
    )
    for (const item of items) {
      const sup = getItemSupplier(item, lookups)
      const line = Number(item.price || 0) * Number(item.qty || 0)
      const cost = (costMap.get((item.name || '').trim()) || 0) * Number(item.qty || 0)
      if (!bySup.has(sup)) {
        bySup.set(sup, {
          supplier: sup,
          revenue: 0,
          cost: 0,
          shippingAllocated: 0,
          orderIds: new Set()
        })
      }
      const row = bySup.get(sup)
      row.revenue += line
      row.cost += cost
      row.orderIds.add(oid)
      if (orderSub > 0 && shipping > 0) row.shippingAllocated += shipping * (line / orderSub)
    }
  }
  return Array.from(bySup.values())
    .map((r) => ({
      supplier: r.supplier,
      revenue: r.revenue,
      cost: r.cost,
      shippingAllocated: r.shippingAllocated,
      orderCount: r.orderIds.size,
      profit: r.revenue - r.cost - r.shippingAllocated
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

/** ค่า KPI ชุดหนึ่งเมื่อกรองตามชื่อซัพพลายเออร์ (จากรายการสินค้าในออเดอร์ที่จัดส่งแล้ว) */
export function computeFilteredKpis(completedOrders, allProducts, supplierFilter) {
  if (!supplierFilter || supplierFilter === 'all') return null
  const lookups = buildProductSupplierLookups(allProducts)
  const costMap = productCostByName(allProducts)
  let totalSales = 0
  let totalCost = 0
  let totalShipping = 0
  const salesByPayment = { credit: 0, transfer: 0 }
  const orderIds = new Set()
  for (const order of completedOrders || []) {
    const items = order.Items || []
    const orderSub = items.reduce(
      (s, i) => s + Number(i.price || 0) * Number(i.qty || 0),
      0
    )
    const shipping = Number(order['Shipping Cost'] || order.Shipping || order.shipping || 0)
    const orderTotal = Number(order.Total || order.total || 0)
    let matchedSub = 0
    for (const item of items) {
      if (getItemSupplier(item, lookups) !== supplierFilter) continue
      matchedSub += Number(item.price || 0) * Number(item.qty || 0)
      totalSales += Number(item.price || 0) * Number(item.qty || 0)
      totalCost += (costMap.get((item.name || '').trim()) || 0) * Number(item.qty || 0)
    }
    if (matchedSub > 0) {
      orderIds.add(order.ID || order.OrderID)
      if (orderSub > 0 && shipping > 0) totalShipping += shipping * (matchedSub / orderSub)
      const frac = orderSub > 0 ? matchedSub / orderSub : 0
      const pm = (order.PaymentMethod || order.paymentmethod || 'transfer').toLowerCase()
      if (pm === 'credit') salesByPayment.credit += orderTotal * frac
      else salesByPayment.transfer += orderTotal * frac
    }
  }
  const profit = totalSales - totalCost - totalShipping
  return {
    totalSales,
    totalCost,
    totalShippingCost: totalShipping,
    profit,
    profitMargin: totalSales > 0 ? (profit / totalSales) * 100 : 0,
    completedOrders: orderIds.size,
    completedOrdersValue: totalSales,
    salesByPayment
  }
}

function initPeriodMap(period, dateRange) {
  const salesMap = new Map()
  const periods = []
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
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
  return { salesMap, periods }
}

function periodKeyForOrder(orderDate, period) {
  if (period === 'daily') return orderDate.toISOString().split('T')[0]
  if (period === 'monthly') {
    return `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`
  }
  if (period === 'yearly') return String(orderDate.getFullYear())
  return ''
}

function formatChartLabels(periods, period) {
  return periods.map((key) => {
    if (period === 'daily') {
      const date = new Date(key)
      return `${date.getDate()}/${date.getMonth() + 1}`
    }
    if (period === 'monthly') {
      const [year, month] = key.split('-')
      const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
      return `${monthNames[parseInt(month, 10) - 1]} ${year}`
    }
    if (period === 'yearly') return key
    return key
  })
}

/** กราฟยอดขายตามช่วงเวลา เฉพาะรายการสินค้าที่ตรง supplierFilter */
export function buildChartDataForSupplier(orders, supplierFilter, allProducts, period, dateRange) {
  if (!orders || orders.length === 0 || !supplierFilter || supplierFilter === 'all') {
    return { labels: [], datasets: [] }
  }
  const lookups = buildProductSupplierLookups(allProducts)
  const { salesMap, periods } = initPeriodMap(period, dateRange)
  orders.forEach((order) => {
    const orderDate = new Date(order.Timestamp || order.CreatedAt || order.created_at)
    if (!orderDate || Number.isNaN(orderDate.getTime())) return
    const key = periodKeyForOrder(orderDate, period)
    if (!salesMap.has(key)) return
    const items = order.Items || []
    let attributed = 0
    for (const item of items) {
      if (getItemSupplier(item, lookups) !== supplierFilter) continue
      attributed += Number(item.price || 0) * Number(item.qty || 0)
    }
    if (attributed > 0) {
      salesMap.set(key, (salesMap.get(key) || 0) + attributed)
    }
  })
  const labels = formatChartLabels(periods, period)
  const salesData = periods.map((k) => salesMap.get(k) || 0)
  return {
    labels,
    datasets: [
      {
        label: `ยอดขาย — ${supplierFilter}`,
        data: salesData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgb(59, 130, 246)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }
    ]
  }
}
