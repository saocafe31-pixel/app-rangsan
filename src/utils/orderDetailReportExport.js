import { getOrderItemDisplayName, orderItemNameFirstLine } from './orderBundleLineUtils'

const REQUIRED_ORDER_HEADERS = [
  'Supplier',
  'วันที่สรุปรายวัน',
  'OrderID',
  'UserEmail',
  'Username',
  'Itemname',
  'Qty',
  'Price',
  'Total',
  'PaymentMethod',
  'ProductID'
]

function valueOf(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

function asNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeOrderId(order) {
  return String(valueOf(order, ['OrderID', 'orderid', 'order_id', 'ID', 'id'], '')).trim()
}

function toDailyDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().split('T')[0]
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

export function buildUserNameMap(users = []) {
  const map = new Map()
  users.forEach((user) => {
    const email = normalizeKey(valueOf(user, ['Email', 'email', 'UserEmail', 'useremail'], ''))
    const username = String(valueOf(user, ['Username', 'username', 'Name', 'name'], '')).trim()
    if (email && username) map.set(email, username)
  })
  return map
}

export function buildProductLookup(products = []) {
  const byId = new Map()
  const byName = new Map()
  products.forEach((product) => {
    const id = String(valueOf(product, ['ProductID', 'id', 'productid', 'product_id'], '')).trim()
    const name = String(valueOf(product, ['ProductName', 'name', 'productname', 'product_name'], '')).trim()
    const supplier = String(valueOf(product, ['Supplier', 'supplier'], '')).trim()
    const cost = asNumber(valueOf(product, ['Cost', 'cost'], 0))
    if (id) byId.set(id, { id, name, supplier, cost })
    if (name) byName.set(normalizeKey(name), { id, name, supplier, cost })
  })
  return { byId, byName }
}

function resolveUsername(order, userNameMap) {
  const email = String(valueOf(order, ['UserEmail', 'useremail', 'User', 'user'], '')).trim()
  const snapshot = String(valueOf(order, ['Username', 'username'], '')).trim()
  const mapped = email ? userNameMap.get(normalizeKey(email)) : ''
  if (!snapshot || looksLikeEmail(snapshot)) return mapped || snapshot || email
  return snapshot
}

function extractSupplierFromDiscountInfo(discountInfo) {
  const raw = String(discountInfo || '')
  const match = raw.match(/(?:Supplier|FreeShipping|ซัพ(?:พลายเออร์)?|ซัพ)\s*[:=]\s*([^|\n]+)/i)
  if (!match) return ''
  return String(match[1] || '').split(',')[0].trim()
}

function resolveSupplier({ productId, itemName, row, productLookup }) {
  const byId = productId ? productLookup.byId.get(String(productId).trim()) : null
  if (byId?.supplier) return byId.supplier

  const firstLine = orderItemNameFirstLine(itemName)
  const byName =
    productLookup.byName.get(normalizeKey(itemName)) || productLookup.byName.get(normalizeKey(firstLine))
  if (byName?.supplier) return byName.supplier

  return (
    String(valueOf(row, ['Supplier', 'supplier'], '')).trim() ||
    extractSupplierFromDiscountInfo(valueOf(row, ['DiscountInfo', 'discountinfo'], '')) ||
    '-'
  )
}

function resolveProductCost({ productId, itemName, productLookup }) {
  const byId = productId ? productLookup.byId.get(String(productId).trim()) : null
  if (byId) return asNumber(byId.cost)

  const firstLine = orderItemNameFirstLine(itemName)
  const byName =
    productLookup.byName.get(normalizeKey(itemName)) || productLookup.byName.get(normalizeKey(firstLine))
  return asNumber(byName?.cost)
}

function normalizeLineRows(orders = [], productLookup, userNameMap) {
  const rows = []
  orders.forEach((order) => {
    const orderId = normalizeOrderId(order)
    if (!orderId) return

    const base = {
      order,
      orderId,
      date: toDailyDate(valueOf(order, ['Timestamp', 'timestamp', 'CreatedAt', 'created_at'], '')),
      userEmail: String(valueOf(order, ['UserEmail', 'useremail', 'User', 'user'], '')).trim(),
      username: resolveUsername(order, userNameMap),
      total: asNumber(valueOf(order, ['Total', 'total'], 0)),
      paymentMethod: String(valueOf(order, ['PaymentMethod', 'paymentmethod'], '')).trim() || '-',
      discountInfo: String(valueOf(order, ['DiscountInfo', 'discountinfo'], '')).trim(),
      discount: asNumber(valueOf(order, ['Discount', 'discount'], 0)),
      promotionDiscount: asNumber(valueOf(order, ['PromotionDiscount', 'promotionDiscount', 'Promotion', 'promotion'], 0)),
      shipping: asNumber(valueOf(order, ['ShippingCost', 'Shipping', 'shippingCost', 'shipping', 'Shipping Cost'], 0))
    }

    const items = Array.isArray(order.Items) ? order.Items : null
    if (items && items.length > 0) {
      items.forEach((item) => {
        const itemName = String(valueOf(item, ['name', 'Itemname', 'ItemName', 'itemname'], '')).trim()
        const productId = String(valueOf(item, ['id', 'ProductID', 'productId', 'productID', 'productid'], '')).trim()
        rows.push({
          ...base,
          itemName,
          displayName: getOrderItemDisplayName(itemName),
          qty: asNumber(valueOf(item, ['qty', 'Qty'], 0)),
          price: asNumber(valueOf(item, ['price', 'Price'], 0)),
          productId,
          supplier: resolveSupplier({ productId, itemName, row: order, productLookup }),
          productCost: resolveProductCost({ productId, itemName, productLookup })
        })
      })
      return
    }

    const itemName = String(valueOf(order, ['Itemname', 'ItemName', 'itemname', 'item_name'], '')).trim()
    const productId = String(valueOf(order, ['ProductID', 'productId', 'productID', 'productid'], '')).trim()
    rows.push({
      ...base,
      itemName,
      displayName: getOrderItemDisplayName(itemName),
      qty: asNumber(valueOf(order, ['Qty', 'qty'], 0)),
      price: asNumber(valueOf(order, ['Price', 'price'], 0)),
      productId,
      supplier: resolveSupplier({ productId, itemName, row: order, productLookup }),
      productCost: resolveProductCost({ productId, itemName, productLookup })
    })
  })
  return rows
}

export function parseDiscountInfo(discountInfo, fallbackDiscount = 0, fallbackPromotionDiscount = 0) {
  const raw = String(discountInfo || '')
  const parts = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/batch\s*id/i.test(part))

  let codeDiscount = 0
  let promotionDiscount = 0
  const codes = []
  const promotions = []

  for (const part of parts) {
    const minusAmount = part.match(/-\s*([0-9]+(?:\.[0-9]+)?)\s*(?:B|บาท)?/i)
    const labeledAmount = part.match(/(?:Discount|Promotion|ส่วนลด|โปร)[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i)
    const amount = Math.max(0, asNumber(minusAmount?.[1] ?? labeledAmount?.[1] ?? 0))
    const codeMatch = part.match(/(?:Code|Coupon|คูปอง|โค้ด)\s*[:=]\s*([^\s|]+)/i)
    const isPromotion = /Promotion|PromoIds|FreeItems|FreeShipping|โปร/i.test(part)
    const isCode = Boolean(codeMatch) || /Coupon|คูปอง|โค้ด/i.test(part)

    if (codeMatch) codes.push(codeMatch[1])
    if (isPromotion && !/PromoIds/i.test(part) && !/FreeShipping/i.test(part) && !/FreeItems/i.test(part)) {
      promotions.push(part)
    }
    if (amount > 0) {
      if (isPromotion) promotionDiscount += amount
      else if (isCode) codeDiscount += amount
    }
  }

  if (codeDiscount <= 0) codeDiscount = Math.max(0, asNumber(fallbackDiscount))
  if (promotionDiscount <= 0) promotionDiscount = Math.max(0, asNumber(fallbackPromotionDiscount))

  return { codeDiscount, promotionDiscount, codes: [...new Set(codes)], promotions }
}

function makeSheet(name, rows) {
  return { name, rows }
}

function normalizeSupplierFilter(values = []) {
  return new Set((values || []).map((value) => normalizeKey(value)).filter(Boolean))
}

function dedupeOrdersFromLines(lineRows) {
  const map = new Map()
  lineRows.forEach((row) => {
    if (!row.orderId) return
    if (!map.has(row.orderId)) {
      const discount = parseDiscountInfo(row.discountInfo, row.discount, row.promotionDiscount)
      map.set(row.orderId, {
        ...row,
        ...discount,
        suppliers: new Set(),
        itemRevenue: 0,
        productCostTotal: 0,
        itemQty: 0,
        lineCount: 0
      })
    }

    const current = map.get(row.orderId)
    current.suppliers.add(row.supplier || '-')
    current.itemRevenue += row.qty * row.price
    current.productCostTotal += row.qty * row.productCost
    current.itemQty += row.qty
    current.lineCount += 1
  })

  return [...map.values()].map((order) => {
    const discountTotal = order.codeDiscount + order.promotionDiscount
    const formulaTotal = order.itemRevenue - discountTotal + order.shipping
    return {
      ...order,
      supplier: [...order.suppliers].sort((a, b) => a.localeCompare(b, 'th')).join(', '),
      discountTotal,
      formulaTotal,
      diffTotal: order.total - formulaTotal
    }
  })
}

export function buildOrderDetailReportWorkbook({
  orders = [],
  products = [],
  users = [],
  selectedSupplierKeys = []
} = {}) {
  const productLookup = buildProductLookup(products)
  const userNameMap = buildUserNameMap(users)
  const allLineRows = normalizeLineRows(orders, productLookup, userNameMap)
  const supplierFilter = normalizeSupplierFilter(selectedSupplierKeys)
  const lineRows =
    supplierFilter.size > 0
      ? allLineRows.filter((row) => supplierFilter.has(normalizeKey(row.supplier)))
      : allLineRows
  const orderRows = dedupeOrdersFromLines(lineRows)
  const availableSuppliers = [...new Set(allLineRows.map((row) => row.supplier).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'th')
  )

  const orderSheetRows = [
    REQUIRED_ORDER_HEADERS,
    ...lineRows.map((row) => [
      row.supplier,
      row.date,
      row.orderId,
      row.userEmail,
      row.username,
      row.displayName,
      row.qty,
      row.price,
      row.total,
      row.paymentMethod,
      row.productId
    ])
  ]

  const orderTotalRows = [
    [
      'เลขที่ออเดอร์',
      'วันที่สรุปรายวัน',
      'UserEmail',
      'ซัพพลายเออร์',
      'ช่องทางชำระ',
      'ยอดซื้อรวม',
      'ส่วนลด/โปรโมชั่น',
      'ค่าจัดส่ง',
      'สรุปยอดรวมคำสั่งซื้อ',
      'ยอดรวมจากสูตร',
      'ผลต่าง'
    ],
    ...orderRows.map((row) => [
      row.orderId,
      row.date,
      row.userEmail,
      row.supplier,
      row.paymentMethod,
      row.itemRevenue,
      row.discountTotal,
      row.shipping,
      row.total,
      row.formulaTotal,
      row.diffTotal
    ])
  ]

  const customerMap = new Map()
  orderRows.forEach((order) => {
    const key = normalizeKey(order.userEmail) || order.username || '-'
    const current = customerMap.get(key) || {
      email: order.userEmail,
      username: order.username,
      orderCount: 0,
      recordedTotal: 0,
      formulaTotal: 0,
      itemRevenue: 0,
      discountTotal: 0,
      shipping: 0
    }
    current.orderCount += 1
    current.recordedTotal += order.total
    current.formulaTotal += order.formulaTotal
    current.itemRevenue += order.itemRevenue
    current.discountTotal += order.discountTotal
    current.shipping += order.shipping
    customerMap.set(key, current)
  })

  const productMap = new Map()
  lineRows.forEach((row) => {
    const key = row.productId || normalizeKey(row.displayName)
    const current = productMap.get(key) || {
      productId: row.productId,
      itemName: row.displayName,
      supplier: row.supplier,
      qty: 0,
      revenue: 0,
      productCostTotal: 0
    }
    current.qty += row.qty
    current.revenue += row.qty * row.price
    current.productCostTotal += row.qty * row.productCost
    productMap.set(key, current)
  })

  const dailyMap = new Map()
  orderRows.forEach((order) => {
    const current = dailyMap.get(order.date) || {
      date: order.date,
      orderCount: 0,
      recordedTotal: 0,
      formulaTotal: 0,
      itemRevenue: 0,
      discountTotal: 0,
      shipping: 0,
      diffTotal: 0
    }
    current.orderCount += 1
    current.recordedTotal += order.total
    current.formulaTotal += order.formulaTotal
    current.itemRevenue += order.itemRevenue
    current.discountTotal += order.discountTotal
    current.shipping += order.shipping
    current.diffTotal += order.diffTotal
    dailyMap.set(order.date, current)
  })

  const totals = orderRows.reduce(
    (acc, order) => {
      acc.orderCount += 1
      acc.recordedTotal += order.total
      acc.itemRevenue += order.itemRevenue
      acc.codeDiscount += order.codeDiscount
      acc.promotionDiscount += order.promotionDiscount
      acc.discountTotal += order.discountTotal
      acc.shipping += order.shipping
      acc.formulaTotal += order.formulaTotal
      acc.diffTotal += order.diffTotal
      acc.productCostTotal += order.productCostTotal
      return acc
    },
    {
      orderCount: 0,
      recordedTotal: 0,
      itemRevenue: 0,
      codeDiscount: 0,
      promotionDiscount: 0,
      discountTotal: 0,
      shipping: 0,
      formulaTotal: 0,
      diffTotal: 0,
      productCostTotal: 0
    }
  )
  const itemQty = lineRows.reduce((sum, row) => sum + row.qty, 0)
  totals.itemQty = itemQty
  totals.lineCount = lineRows.length
  totals.profit = totals.formulaTotal - totals.productCostTotal
  totals.profitMargin = totals.formulaTotal > 0 ? (totals.profit / totals.formulaTotal) * 100 : 0

  const customerSummary = [...customerMap.values()].sort((a, b) => b.formulaTotal - a.formulaTotal)
  const productSummary = [...productMap.values()].sort((a, b) => b.revenue - a.revenue)
  const dailySummary = [...dailyMap.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return {
    lineRows,
    orderRows,
    availableSuppliers,
    customerSummary,
    productSummary,
    dailySummary,
    totals,
    sheets: [
      makeSheet('ออเดอร์', orderSheetRows),
      makeSheet('ยอดรวมตามออเดอร์', orderTotalRows),
      makeSheet('สรุปยอดซื้อลูกค้า', [
        ['UserEmail', 'Username', 'จำนวนออเดอร์', 'ยอดขายสุทธิจากสูตร', 'ยอดขายรวมที่บันทึกในออเดอร์', 'รายได้จากสินค้า', 'ส่วนลด/โปรโมชั่น', 'ค่าจัดส่ง'],
        ...customerSummary.map((row) => [
          row.email,
          row.username,
          row.orderCount,
          row.formulaTotal,
          row.recordedTotal,
          row.itemRevenue,
          row.discountTotal,
          row.shipping
        ])
      ]),
      makeSheet('สรุปยอดขายสินค้า', [
        ['ProductID', 'Itemname', 'Supplier', 'Qty', 'ยอดขายสินค้า', 'ต้นทุนสินค้า'],
        ...productSummary.map((row) => [
          row.productId,
          row.itemName,
          row.supplier,
          row.qty,
          row.revenue,
          row.productCostTotal
        ])
      ]),
      makeSheet('สรุปรวม', [
        ['รายการ', 'มูลค่า'],
        ['จำนวนออเดอร์ (dedupe OrderID)', totals.orderCount],
        ['จำนวนรายการสินค้า', totals.lineCount],
        ['จำนวนสินค้ารวม', totals.itemQty],
        ['รายได้จากสินค้า (Qty x Price)', totals.itemRevenue],
        ['ส่วนลดโค้ด', totals.codeDiscount],
        ['ส่วนลดโปรโมชั่น', totals.promotionDiscount],
        ['ส่วนลด/โปรโมชั่นรวม', totals.discountTotal],
        ['ค่าจัดส่ง', totals.shipping],
        ['ยอดขายสุทธิจากสูตร', totals.formulaTotal],
        ['ยอดขายรวมที่บันทึกในออเดอร์', totals.recordedTotal],
        ['ผลต่างยอดบันทึกกับสูตร', totals.diffTotal]
      ]),
      makeSheet('สรุปยอดรายวัน', [
        ['วันที่สรุปรายวัน', 'จำนวนออเดอร์', 'รายได้จากสินค้า', 'ส่วนลด/โปรโมชั่น', 'ค่าจัดส่ง', 'ยอดขายสุทธิจากสูตร', 'ยอดขายรวมที่บันทึกในออเดอร์', 'ผลต่าง'],
        ...dailySummary.map((row) => [
          row.date,
          row.orderCount,
          row.itemRevenue,
          row.discountTotal,
          row.shipping,
          row.formulaTotal,
          row.recordedTotal,
          row.diffTotal
        ])
      ]),
      makeSheet('สรุปงบกำไรขาดทุน', [
        ['รายการ', 'มูลค่า'],
        ['รายได้จากสินค้า', totals.itemRevenue],
        ['หัก ส่วนลด/โปรโมชั่น', totals.discountTotal],
        ['บวก ค่าจัดส่ง', totals.shipping],
        ['ยอดขายสุทธิจากสูตร', totals.formulaTotal],
        ['ยอดขายรวมที่บันทึกในออเดอร์', totals.recordedTotal],
        ['ผลต่างยอดบันทึกกับสูตร', totals.diffTotal],
        ['ต้นทุนสินค้า', totals.productCostTotal],
        ['กำไร/ขาดทุน', totals.profit],
        ['อัตรากำไร (%)', totals.profitMargin]
      ])
    ]
  }
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textLength(value) {
  return String(value ?? '').length
}

function columnWidth(rows, columnIndex) {
  const maxLen = Math.max(
    8,
    ...((rows || []).slice(0, 200).map((row) => textLength(row?.[columnIndex])) || [])
  )
  return Math.min(240, Math.max(70, maxLen * 8 + 18))
}

function columnsXml(rows) {
  const columnCount = Math.max(0, ...(rows || []).map((row) => row?.length || 0))
  return Array.from({ length: columnCount }, (_, index) => {
    return `<Column ss:AutoFitWidth="0" ss:Width="${columnWidth(rows, index)}"/>`
  }).join('')
}

function stylesXml() {
  return `<Styles>
  <Style ss:ID="Default" ss:Name="Normal">
    <Alignment ss:Vertical="Center"/>
    <Font ss:FontName="Arial" ss:Size="10"/>
  </Style>
  <Style ss:ID="Header">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#047857" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#065F46"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1FAE5"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1FAE5"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1FAE5"/>
    </Borders>
  </Style>
  <Style ss:ID="TextCell">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    </Borders>
  </Style>
  <Style ss:ID="NumberCell">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <NumberFormat ss:Format="#,##0.##"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    </Borders>
  </Style>
  <Style ss:ID="AltTextCell">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    </Borders>
  </Style>
  <Style ss:ID="AltNumberCell">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="#,##0.##"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    </Borders>
  </Style>
</Styles>`
}

function worksheetOptionsXml() {
  return `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
  <FreezePanes/>
  <FrozenNoSplit/>
  <SplitHorizontal>1</SplitHorizontal>
  <TopRowBottomPane>1</TopRowBottomPane>
  <ActivePane>2</ActivePane>
</WorksheetOptions>`
}

function cellXml(value, rowIndex) {
  const isNum = typeof value === 'number' && Number.isFinite(value)
  const type = isNum ? 'Number' : 'String'
  const style =
    rowIndex === 0
      ? 'Header'
      : isNum
        ? rowIndex % 2 === 0
          ? 'AltNumberCell'
          : 'NumberCell'
        : rowIndex % 2 === 0
          ? 'AltTextCell'
          : 'TextCell'
  return `<Cell ss:StyleID="${style}"><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`
}

export function createOrderDetailReportExcelXml(sheets) {
  const worksheets = (sheets || [])
    .map(
      (sheet) => `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>${columnsXml(sheet.rows)}${(sheet.rows || [])
        .map((row, rowIndex) => `<Row ss:AutoFitHeight="1">${(row || []).map((cell) => cellXml(cell, rowIndex)).join('')}</Row>`)
        .join('')}</Table>${worksheetOptionsXml()}</Worksheet>`
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${stylesXml()}
${worksheets}
</Workbook>`
}

export function downloadOrderDetailReportExcel({ sheets, filename }) {
  const xml = createOrderDetailReportExcelXml(sheets)
  const blob = new Blob(['\uFEFF' + xml], {
    type: 'application/vnd.ms-excel;charset=utf-8'
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename || 'รายงานออเดอร์ละเอียด.xls'
  link.click()
  URL.revokeObjectURL(link.href)
  return { blob, rowCount: Math.max(0, (sheets?.[0]?.rows?.length || 1) - 1) }
}
