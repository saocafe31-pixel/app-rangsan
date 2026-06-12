import { describe, expect, it } from 'vitest'
import {
  buildOrderDetailReportWorkbook,
  createOrderDetailReportExcelXml,
  parseDiscountInfo
} from './orderDetailReportExport'

const products = [
  { ProductID: 'P1', ProductName: 'กาแฟ', Supplier: 'Supplier A', Cost: 60 },
  { ProductID: 'P2', ProductName: 'ชา', Supplier: 'Supplier B', Cost: 20 }
]

const users = [{ Email: 'alice@example.com', Username: 'Alice' }]

describe('orderDetailReportExport', () => {
  it('builds all required sheets and order detail columns', () => {
    const workbook = buildOrderDetailReportWorkbook({
      orders: [
        {
          OrderID: 'O1',
          UserEmail: 'alice@example.com',
          Username: 'alice@example.com',
          Itemname: 'กาแฟ',
          Qty: 2,
          Price: 100,
          Total: 260,
          PaymentMethod: 'transfer',
          ProductID: 'P1',
          Timestamp: '2026-06-10T02:00:00.000Z',
          DiscountInfo: 'Code: SAVE10 -10B | Promotion: -20B | Batch ID: BATCH123',
          ShippingCost: 90
        }
      ],
      products,
      users
    })

    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      'ออเดอร์',
      'ยอดรวมตามออเดอร์',
      'สรุปยอดซื้อลูกค้า',
      'สรุปยอดขายสินค้า',
      'สรุปรวม',
      'สรุปยอดรายวัน',
      'สรุปงบกำไรขาดทุน'
    ])
    expect(workbook.sheets[0].rows[0]).toEqual([
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
    ])
    expect(workbook.sheets[0].rows[1]).toEqual([
      'Supplier A',
      '2026-06-10',
      'O1',
      'alice@example.com',
      'Alice',
      'กาแฟ',
      2,
      100,
      260,
      'transfer',
      'P1'
    ])
  })

  it('dedupes order-level totals and reconciles recorded total against formula total', () => {
    const workbook = buildOrderDetailReportWorkbook({
      orders: [
        {
          OrderID: 'O1',
          UserEmail: 'alice@example.com',
          Username: '',
          Itemname: 'กาแฟ',
          Qty: 2,
          Price: 100,
          Total: 250,
          PaymentMethod: 'transfer',
          ProductID: 'P1',
          Timestamp: '2026-06-10T02:00:00.000Z',
          DiscountInfo: 'Code: SAVE10 -50B | Promotion: -20B | Batch ID: BATCH123',
          ShippingCost: 30
        },
        {
          OrderID: 'O1',
          UserEmail: 'alice@example.com',
          Username: '',
          Itemname: 'ชา',
          Qty: 1,
          Price: 50,
          Total: 250,
          PaymentMethod: 'transfer',
          ProductID: 'P2',
          Timestamp: '2026-06-10T02:00:00.000Z',
          DiscountInfo: 'Code: SAVE10 -50B | Promotion: -20B | Batch ID: BATCH123',
          ShippingCost: 30
        }
      ],
      products,
      users
    })

    expect(workbook.lineRows).toHaveLength(2)
    expect(workbook.orderRows).toHaveLength(1)
    expect(workbook.totals).toMatchObject({
      orderCount: 1,
      itemRevenue: 250,
      codeDiscount: 50,
      promotionDiscount: 20,
      discountTotal: 70,
      shipping: 30,
      formulaTotal: 210,
      recordedTotal: 250,
      diffTotal: 40,
      productCostTotal: 140,
      profit: 70
    })

    const orderTotalSheet = workbook.sheets.find((sheet) => sheet.name === 'ยอดรวมตามออเดอร์')
    expect(orderTotalSheet.rows[1]).toEqual([
      'O1',
      'Supplier A, Supplier B',
      'transfer',
      250,
      70,
      30,
      250,
      210,
      40
    ])

    const customerSheet = workbook.sheets.find((sheet) => sheet.name === 'สรุปยอดซื้อลูกค้า')
    expect(customerSheet.rows[1]).toEqual(['alice@example.com', 'Alice', 1, 210, 250, 250, 70, 30])
  })

  it('filters workbook line rows and summaries by selected suppliers', () => {
    const workbook = buildOrderDetailReportWorkbook({
      orders: [
        {
          OrderID: 'O1',
          UserEmail: 'alice@example.com',
          Itemname: 'กาแฟ',
          Qty: 2,
          Price: 100,
          Total: 250,
          ProductID: 'P1',
          Timestamp: '2026-06-10T02:00:00.000Z',
          DiscountInfo: 'Code: SAVE10 -50B',
          ShippingCost: 30
        },
        {
          OrderID: 'O1',
          UserEmail: 'alice@example.com',
          Itemname: 'ชา',
          Qty: 1,
          Price: 50,
          Total: 250,
          ProductID: 'P2',
          Timestamp: '2026-06-10T02:00:00.000Z',
          DiscountInfo: 'Code: SAVE10 -50B',
          ShippingCost: 30
        }
      ],
      products,
      selectedSupplierKeys: ['Supplier A']
    })

    expect(workbook.lineRows).toHaveLength(1)
    expect(workbook.lineRows[0].supplier).toBe('Supplier A')
    expect(workbook.totals.itemRevenue).toBe(200)
    expect(workbook.totals.formulaTotal).toBe(180)
    expect(workbook.availableSuppliers).toEqual(['Supplier A', 'Supplier B'])
  })

  it('does not parse Batch ID numbers as discounts', () => {
    expect(parseDiscountInfo('Batch ID: BATCH123 | Code: SAVE10 -50B')).toMatchObject({
      codeDiscount: 50,
      promotionDiscount: 0
    })
  })

  it('falls back supplier from DiscountInfo when product map and row supplier are unavailable', () => {
    const workbook = buildOrderDetailReportWorkbook({
      orders: [
        {
          OrderID: 'O2',
          UserEmail: 'bob@example.com',
          Itemname: 'สินค้าพิเศษ',
          Qty: 1,
          Price: 99,
          Total: 99,
          Timestamp: '2026-06-11T02:00:00.000Z',
          DiscountInfo: 'FreeShipping: Supplier Z'
        }
      ]
    })

    expect(workbook.sheets[0].rows[1][0]).toBe('Supplier Z')
  })

  it('creates an Excel XML workbook with multiple worksheets', () => {
    const workbook = buildOrderDetailReportWorkbook({
      orders: [{ OrderID: 'O1', Itemname: 'กาแฟ', Qty: 1, Price: 100, Total: 100 }]
    })
    const xml = createOrderDetailReportExcelXml(workbook.sheets)
    expect(xml).toContain('<Worksheet ss:Name="ออเดอร์">')
    expect(xml).toContain('<Worksheet ss:Name="สรุปงบกำไรขาดทุน">')
  })
})
