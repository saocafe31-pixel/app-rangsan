/**
 * Parse a single CSV line (handles quoted fields; supports comma or semicolon delimiter)
 * @param {string} line
 * @param {string} delimiter - ',' or ';'
 * @returns {string[]}
 */
function parseCSVLine(line, delimiter = ',') {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

/**
 * แปลงอักขระเต็มความกว้าง (fullwidth) เป็นครึ่งความกว้าง (halfwidth)
 * บางโปรแกรม/คัดลอกจากเว็บจะได้ "Ｐｒｏｄｕｃｔ　ＩＤ" แทน "Product ID"
 */
function fullwidthToHalfwidth(str) {
  return String(str).replace(/[\uFF01-\uFF5E\u3000]/g, (ch) => {
    if (ch === '\u3000') return ' '
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  })
}

/**
 * Normalize header name for column mapping (lowercase, no extra spaces, strip BOM and invisible chars)
 * Google Sheets / Excel อาจมี zero-width space หรืออักขระ fullwidth ในหัวคอลัมน์
 */
// อักขระที่ถือว่าเป็น quote (ASCII + Unicode smart quotes จาก Excel/Word)
const QUOTE_OR_BACKSLASH = /["'\\\u201C\u201D\u201E\u201F\u2033\u2036]/
function norm(s) {
  let t = String(s || '')
    .replace(/\uFEFF|\u200B|\u200C|\u200D|\u00A0/g, '') // BOM, zero-width, nbsp
  // ลบ quote/backslash ที่หัวและท้ายจนหมด (รวม smart quotes ที่ Excel/Google ใส่)
  while (t.length && QUOTE_OR_BACKSLASH.test(t[0])) t = t.slice(1)
  while (t.length && QUOTE_OR_BACKSLASH.test(t[t.length - 1])) t = t.slice(0, -1)
  t = fullwidthToHalfwidth(t)
  if (t.normalize) t = t.normalize('NFC') // รวมรูปอักษรไทย/Unicode ให้ตรงกัน
  return t
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const HEADER_MAP = [
  { keys: ['product id', 'productid', 'รหัสสินค้า', 'product_id', 'product  id'], field: 'productId' },
  { keys: ['product name', 'productname', 'ชื่อสินค้า', 'name', 'ชื่อ สินค้า'], field: 'productName' },
  { keys: ['price', 'ราคา', 'ราคา (บาท)'], field: 'price' },
  { keys: ['stock', 'จำนวนสต็อก', 'สต๊อกเริ่มต้น', 'สต๊อก', 'initial stock'], field: 'stock' },
  { keys: ['minstock', 'min stock', 'สต๊อกขั้นต่ำ', 'minimum stock', 'min_stock'], field: 'minStock' }
]

/** รองรับหัวคอลัมน์ที่อาจมี space ระหว่างคำ (หลัง norm แล้ว) */
function headerMatches(headerNorm, keys, field) {
  if (!headerNorm) return false
  if (keys.some(k => headerNorm === k || headerNorm.includes(k))) return true
  // รองรับ "product id" แม้มีตัวอักษรซ่อนเร้นระหว่างคำ
  if (headerNorm.replace(/\s/g, '').replace(/\u200B|\u200C|\u200D/g, '') === 'productid') return true
  // รองรับหัวคอลัมน์ "ชื่อสินค้า" แม้มีตัวอักษรแทรกหรือรูปแบบ Unicode ต่างกัน
  if (field === 'productName' && headerNorm.includes('ชื่อ') && headerNorm.includes('สินค้า')) return true
  // รองรับ "Product ID" ที่มีตัวอักษรแปลกแทรก
  if (field === 'productId' && headerNorm.replace(/\s/g, '').includes('product') && headerNorm.includes('id')) return true
  return false
}

/**
 * Map header row (array of strings) to field names: productId, productName, price, stock, minStock
 * @param {string[]} headers
 * @returns {{ [field: string]: number }} column index by field name
 */
export function mapCSVHeaders(headers) {
  const colMap = {}
  const normalized = headers.map(norm)
  for (const { keys, field } of HEADER_MAP) {
    const idx = normalized.findIndex(h => headerMatches(h, keys, field))
    if (idx !== -1) colMap[field] = idx
  }
  return colMap
}

/**
 * Parse CSV text into rows for custom product import.
 * Expected columns (Thai or English): Product ID, ชื่อสินค้า, ราคา, สต๊อกเริ่มต้น, สต๊อกขั้นต่ำ
 * @param {string} text - raw CSV file text (UTF-8)
 * @returns {{ rows: Array<{ productId: string, productName: string, price: number, stock: number, minStock: number }>, errors: string[] }}
 */
export function parseCSVForCustomProducts(text) {
  const errors = []
  // ลบ BOM และทำให้บรรทัดสม่ำเสมอ (Google Sheets / Excel ใช้ \r\n หรือ \n)
  text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // แปลงอักขระที่คล้าย comma เป็น comma ปกติ (U+FF0C เต็มความกว้าง, U+060C อาหรับ, U+3001 ideographic)
  text = text.replace(/[\uFF0C\u060C\u3001]/g, ',')
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) {
    return { rows: [], errors: ['ไฟล์ CSV ต้องมีหัวคอลัมน์และอย่างน้อย 1 แถวข้อมูล'] }
  }
  // ตรวจสอบตัวคั่น: เลือกตัวที่ให้จำนวนคอลัมน์มากที่สุด (รองรับ CSV คั่นด้วย comma, tab หรือ semicolon)
  const firstLine = lines[0]
  const byComma = parseCSVLine(firstLine, ',')
  const byTab = parseCSVLine(firstLine, '\t')
  const bySemicolon = parseCSVLine(firstLine, ';')
  let delimiter = ','
  if (byTab.length >= byComma.length && byTab.length >= bySemicolon.length && byTab.length > 1) {
    delimiter = '\t'
  } else if (bySemicolon.length >= byComma.length && bySemicolon.length > 1) {
    delimiter = ';'
  }
  let headerRowIndex = 0
  let headers = parseCSVLine(firstLine, delimiter)
  let colMap = mapCSVHeaders(headers)
  // ถ้าแถวแรกจับหัวไม่เจอ ลองแถว 2–3 (กรณีมีแถวหัวเรื่อง)
  for (let tryRow = 1; tryRow < Math.min(3, lines.length) && (!colMap.productId || !colMap.productName); tryRow++) {
    const line = lines[tryRow]
    const byDelim = parseCSVLine(line, delimiter)
    const map = mapCSVHeaders(byDelim)
    if (map.productId != null && map.productName != null) {
      headerRowIndex = tryRow
      headers = byDelim
      colMap = map
      break
    }
  }

  if (!colMap.productId || !colMap.productName) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[CSV] ไม่พบหัวคอลัมน์ที่ต้องการ. ตัวคั่น:', delimiter === '\t' ? 'tab' : delimiter === ';' ? 'semicolon' : 'comma', 'แถวแรก (ดิบ):', JSON.stringify(lines[0].slice(0, 200)))
      console.warn('[CSV] แยกได้จำนวนคอลัมน์:', headers.length, 'ค่า:', headers.map(c => JSON.stringify(c.slice(0, 30))))
    }
    const msg = 'ไม่พบคอลัมน์ Product ID หรือ ชื่อสินค้า ในแถวแรก (รองรับ: Product ID, ชื่อสินค้า, ราคา, สต๊อกเริ่มต้น, สต๊อกขั้นต่ำ). ถ้าบันทึกจาก Excel ให้ลองบันทึกเป็น CSV UTF-8 (Comma delimited)'
    return { rows: [], errors: [msg] }
  }
  const rows = []
  const dataStartIndex = headerRowIndex + 1
  const stripCellQuotes = (v) => {
    let x = String(v ?? '').trim()
    while (x.length && QUOTE_OR_BACKSLASH.test(x[0])) x = x.slice(1)
    while (x.length && QUOTE_OR_BACKSLASH.test(x[x.length - 1])) x = x.slice(0, -1)
    return x
  }
  for (let i = dataStartIndex; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i], delimiter)
    const productId = stripCellQuotes(cells[colMap.productId])
    const productName = stripCellQuotes(cells[colMap.productName])
    if (!productId && !productName) continue // skip empty row
    const price = parseFloat(String(cells[colMap.price] ?? '0').replace(/,/g, '')) || 0
    const stock = parseInt(String(cells[colMap.stock] ?? '0').replace(/,/g, ''), 10) || 0
    const minStock = colMap.minStock != null
      ? parseInt(String(cells[colMap.minStock] ?? '5').replace(/,/g, ''), 10)
      : 5
    rows.push({
      productId: productId || `ROW${i + 1}`,
      productName: productName || '-',
      price: Number.isNaN(price) ? 0 : price,
      stock: Number.isNaN(stock) ? 0 : Math.max(0, stock),
      minStock: Number.isNaN(minStock) ? 5 : Math.max(0, minStock)
    })
  }
  return { rows, errors }
}
