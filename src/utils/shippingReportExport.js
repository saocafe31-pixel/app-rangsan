/**
 * ส่งออกรายงานการจัดส่ง (CSV) สำหรับโลจิสติกส์
 * แถวข้อมูล = หนึ่งแถวต่อหนึ่งกล่องจาก order_packing เท่านั้น (ออเดอร์ที่ยังไม่แพ็กจะไม่อยู่ในไฟล์)
 * น้ำหนัก: ถ้ากรอก weight_kg ตอนแพ็ก > 0 = น้ำหนักรวมพร้อมกล่องแล้ว (ใช้ค่านั้นโดยตรง)
 * ถ้าไม่กรอก = น้ำหนักสินค้าจาก products + น้ำหนักกล่องเปล่าตามไซส์ (packingBoxWeightBySize) หรือ packingBoxWeightKg เดิม
 * คอลัมน์: วันที่, Ref., …, อธิบายสินค้า (Category), Size, จำนวน (กล่อง), น้ำหนัก
 */
import { getShopInfo } from '../services/shopSettingsService'
import { supabase } from './supabase'

function escapeCsv(val) {
  if (val == null) return ''
  // แปลงขึ้นบรรทัดในเซลล์เป็นช่องว่าง — มิฉะนั้น Excel/ระบบขนส่งบางตัวจะแยกเป็นแถวใหม่แล้วคอลัมน์เพี้ยน
  let s = String(val).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, ' ')
  if (/[",]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** ดึง ProductID -> { Category, Weight } จากตาราง products (RANGSAN/SAO: ProductID, Category, Weight) */
async function fetchProductCategoryAndWeight(productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))]
  if (ids.length === 0) return {}
  const { data } = await supabase.from('products').select('ProductID, Category, Weight').in('ProductID', ids)
  const map = {}
  ;(data || []).forEach((p) => {
    const id = p.ProductID ?? p.productid
    if (id) map[id] = { category: p.Category ?? p.category ?? '', weight: Number(p.Weight ?? p.weight) || 0 }
  })
  return map
}

/** คำอธิบายต่อบรรทัด: ใช้ Category จาก products เป็นหลัก ถ้าไม่มีในแมปค่อยแมปจากรายการออเดอร์ แล้วจึงใช้ชื่อสินค้า */
function lineDescFromCategory(item, productMap, orderItems) {
  const pid = item.productId || item.productID || item.id
  const pname = item.name
  let cat = pid ? String((productMap[pid] || {}).category || '').trim() : ''
  if (!cat && orderItems?.length) {
    const line = orderItems.find((o) => {
      const oid = o.id || o.name
      if (!oid) return false
      if (pid && String(oid) === String(pid)) return true
      if (pname && (o.name === pname || oid === pname)) return true
      return false
    })
    const id2 = line?.id || line?.name
    if (id2) cat = String((productMap[id2] || {}).category || '').trim()
  }
  const qty = item.qty || 0
  if (cat) return `${cat} x${qty}`
  const name = pname || item.Name || item.productName || pid || ''
  return name ? `${name} x${qty}` : ''
}

function joinLineDescriptions(items, productMap, orderItems) {
  return (items || []).map((i) => lineDescFromCategory(i, productMap, orderItems)).filter(Boolean).join(', ')
}

/**
 * แยกที่อยู่ไทยจากข้อความยาว (เมื่อคอลัมน์ ต./อ./จ./รหัส ว่างใน DB)
 * คืน { lineAddress, subdistrict, district, province, postalCode, phoneFromText }
 */
function parseThaiAddressFromFreeform(raw) {
  const empty = { lineAddress: '', subdistrict: '', district: '', province: '', postalCode: '', phoneFromText: '' }
  if (!raw || typeof raw !== 'string') return empty
  let s = raw.replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return empty

  let phoneFromText = ''
  const telRe = /(?:โทร|Tel\.?)\s*[:\.]?\s*([0-9][0-9\-\s]{7,14})/i
  const telM = s.match(telRe)
  if (telM) {
    phoneFromText = telM[1].replace(/[\s-]/g, '')
    s = s.replace(telM[0], ' ').replace(/\s+/g, ' ').trim()
  }

  let postalCode = ''
  const pcM = s.match(/\b(\d{5})\b(?!\d)/)
  if (pcM) {
    postalCode = pcM[1]
    s = s.replace(pcM[0], ' ').replace(/\s+/g, ' ').trim()
  }

  let province = ''
  const provM = s.match(/(?:จ\.|จังหวัด)\s*([ก-๙A-Za-z.]+(?:\s+[ก-๙A-Za-z.]+)*)/)
  if (provM) {
    province = provM[1].trim().replace(/\.$/, '')
    s = s.replace(provM[0], ' ').replace(/\s+/g, ' ').trim()
  }

  let district = ''
  const distM = s.match(/(?:อ\.|อำเภอ)\s*([ก-๙A-Za-z.]+(?:\s+[ก-๙A-Za-z.]+)*)/)
  if (distM) {
    district = distM[1].trim().replace(/\.$/, '')
    s = s.replace(distM[0], ' ').replace(/\s+/g, ' ').trim()
  }

  let subdistrict = ''
  const subM = s.match(/(?:ต\.|ตำบล|แขวง)\s*([ก-๙A-Za-z.]+(?:\s+[ก-๙A-Za-z.]+)*)/)
  if (subM) {
    subdistrict = subM[1].trim().replace(/\.$/, '')
    s = s.replace(subM[0], ' ').replace(/\s+/g, ' ').trim()
  }

  const lineAddress = s.replace(/\s+/g, ' ').trim()
  return { lineAddress, subdistrict, district, province, postalCode, phoneFromText }
}

function mergeShippingAddressForRow(order) {
  const addr = (order.Address || order.address || '').toString()
  let sub = (order.Subdistrict || order.subdistrict || '').toString().trim()
  let dist = (order.District || order.district || '').toString().trim()
  let prov = (order.Province || order.province || '').toString().trim()
  let pc = (order.PostalCode || order.postalcode || order['Postal Code'] || '').toString().trim()
  let phone = (order.RecipientPhone || order.recipientphone || '').toString().trim()

  const parsed = parseThaiAddressFromFreeform(addr)
  if (!sub && parsed.subdistrict) sub = parsed.subdistrict
  if (!dist && parsed.district) dist = parsed.district
  if (!prov && parsed.province) prov = parsed.province
  if (!pc && parsed.postalCode) pc = parsed.postalCode
  if (!phone && parsed.phoneFromText) phone = parsed.phoneFromText

  const lineReceiver = (parsed.lineAddress || addr.replace(/\n/g, ' ').trim()) || addr.replace(/\n/g, ' ').trim()

  return {
    addressLine: lineReceiver,
    subdistrict: sub,
    district: dist,
    province: prov,
    postalCode: pc,
    phone
  }
}

const PAYMENT_METHOD_LABELS = {
  credit: 'เครดิต',
  cod: 'ชำระเงินปลายทาง',
  transfer: 'โอนเงิน',
  cash: 'เงินสด',
  card: 'บัตรเครดิต/เดบิต',
  'ชำระเงินปลายทาง': 'ชำระเงินปลายทาง',
  'โอนเงิน': 'โอนเงิน',
  'เครดิต': 'เครดิต'
}

function paymentLabelFromOrder(order) {
  const raw = (order.PaymentMethod ?? order.paymentmethod ?? '').toString().trim()
  if (!raw) return '-'
  const key = raw.toLowerCase()
  if (PAYMENT_METHOD_LABELS[key]) return PAYMENT_METHOD_LABELS[key]
  if (PAYMENT_METHOD_LABELS[raw]) return PAYMENT_METHOD_LABELS[raw]
  return raw
}

/** น้ำหนักสุดท้าย (กก.) — กรอก weight_kg ในแพ็ก = รวมพร้อมกล่องแล้ว; ไม่กรอก = สินค้าจาก DB + shellKg */
function computeFinalKgForBox(box, productMap, shellKg) {
  const manual = box.weight_kg ?? box.weight_Kg
  const manualNum = manual != null && manual !== '' ? Number(manual) : NaN
  if (Number.isFinite(manualNum) && manualNum > 0) return manualNum

  const items = box.items || []
  let totalGrams = 0
  items.forEach((i) => {
    const w = (productMap[i.productId || i.productID || i.id] || {}).weight || 0
    totalGrams += w * (i.qty || 0)
  })
  if (totalGrams <= 0) {
    if (shellKg > 0) return shellKg
    return null
  }
  return totalGrams / 1000 + shellKg
}

function formatKg(kg) {
  if (kg == null || !Number.isFinite(kg) || kg < 0) return ''
  return kg >= 1 ? kg.toFixed(2) : kg.toFixed(3)
}

/**
 * @param {Array<{ order, packing: Array<{ size, weight_kg, items }> }>} ordersWithPacking
 * @returns {Promise<{ blob: Blob, skippedNoPacking: number, rowCount: number }>}
 */
export async function exportShippingReportCsv(ordersWithPacking) {
  const shop = await getShopInfo()
  const BOM = '\uFEFF'
  const headers = [
    'วันที่',
    'Ref. เลขอ้างอิง',
    'ชื่อผู้ส่ง',
    'ที่อยู่ผู้ส่ง',
    'ชื่อผู้รับ',
    'ที่อยู่ผู้รับ',
    'ตำบล',
    'อำเภอ',
    'จังหวัด',
    'รหัสไปรษณีย์',
    'เบอร์ติดต่อ',
    'ประเภทการชำระเงิน',
    'อธิบายสินค้า',
    'Size',
    'จำนวน',
    'น้ำหนัก'
  ]
  const rows = [headers.map(escapeCsv).join(',')]

  const allProductIds = []
  for (const { order, packing } of ordersWithPacking) {
    for (const i of order.Items || []) {
      allProductIds.push(i.id || i.productId || i.productID)
    }
    if (packing && packing.length > 0) {
      for (const box of packing) {
        ;(box.items || []).forEach((i) => allProductIds.push(i.productId || i.productID || i.id || i.name))
      }
    }
  }
  const productMap = await fetchProductCategoryAndWeight(allProductIds)
  const bySize = shop.packingBoxWeightBySize && typeof shop.packingBoxWeightBySize === 'object' ? shop.packingBoxWeightBySize : {}
  const legacyShell = Number(shop.packingBoxWeightKg) || 0

  let skippedNoPacking = 0
  for (const { order, packing } of ordersWithPacking) {
    if (!packing || packing.length === 0) {
      skippedNoPacking++
      continue
    }

    const orderId = order.ID || order.OrderID
    const dateStr = order.Timestamp || order.CreatedAt
    const dateFormatted = dateStr ? new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''
    const paymentLabel = paymentLabelFromOrder(order)
    const recipientName = order.Username || order.UserEmail || order.User || ''
    const ship = mergeShippingAddressForRow(order)

    for (const box of packing) {
      const items = box.items || []
      const desc = joinLineDescriptions(items, productMap, order.Items || [])
      const sizeKey = (box.size || '').toString().trim()
      const shellKg = Number(bySize[sizeKey]) || legacyShell
      const totalKg = computeFinalKgForBox(box, productMap, shellKg)
      const weight = totalKg != null ? formatKg(totalKg) : ''
      const qty = 1
      rows.push(
        [
          dateFormatted,
          orderId,
          shop.name || '',
          (shop.address || '').replace(/\n/g, ' '),
          recipientName,
          ship.addressLine.replace(/\n/g, ' '),
          ship.subdistrict,
          ship.district,
          ship.province,
          ship.postalCode,
          ship.phone,
          paymentLabel,
          desc,
          box.size || '',
          qty,
          weight
        ]
          .map(escapeCsv)
          .join(',')
      )
    }
  }

  const csv = BOM + rows.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  return {
    blob,
    skippedNoPacking,
    rowCount: Math.max(0, rows.length - 1)
  }
}
