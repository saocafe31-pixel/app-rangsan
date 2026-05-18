/**
 * เวลาแสดงในแอป: Asia/Bangkok
 * Postgres/Supabase มักส่ง timestamp แบบไม่มี offset (เช่น 2026-03-25T03:19:00)
 * — ถ้าเก็บเป็นค่า UTC แล้วใช้ new Date(...) ในเบราว์เซอร์ไทย จะถูกตีเป็นเวลาท้องถิ่น
 *   แล้วไปใช้ getUTCHours()+7 จะเพี้ยน (แสดงเป็น 03:19 แทน 10:19)
 * parseDbDateTime: ถ้าไม่มี Z/offset ให้ตีความเป็น UTC แล้วค่อย format ด้วย timeZone Bangkok
 */

export const APP_TIME_ZONE = 'Asia/Bangkok'

function hasExplicitTimeZone(s) {
  const t = String(s).trim()
  // อย่าจับ YYYY-MM-DD ว่ามี timezone — ส่วนท้าย -DD จะไปคู่กับ [+-]\d{2}
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return false
  return (
    /[zZ]\s*$/.test(t) ||
    /[+-]\d{2}:\d{2}\s*$/.test(t) ||
    /[+-]\d{4}\s*$/.test(t) ||
    // เวลา + offset สั้น เช่น ...T03:19:00+00 (ไม่มี :00 ท้าย offset)
    /T.*[+-]\d{2}\s*$/.test(t)
  )
}

/**
 * @param {string|number|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseDbDateTime(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{10}$/.test(s)) {
    const d = new Date(parseInt(s, 10) * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  if (/^\d{13}$/.test(s)) {
    const d = new Date(parseInt(s, 10))
    return isNaN(d.getTime()) ? null : d
  }
  if (hasExplicitTimeZone(s)) {
    let d = new Date(s)
    if (!isNaN(d.getTime())) return d
    // ECMAScript ไม่รับ offset แบบ +00 ต้องเป็น +00:00
    const expanded = s.replace(/([+-]\d{2})\s*$/, (_, off) => `${off}:00`)
    if (expanded !== s) {
      d = new Date(expanded)
      if (!isNaN(d.getTime())) return d
    }
    return null
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)/)
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}Z`)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

const THAI_MONTH_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.'
]

/** ประเทศไทย UTC+7 ตลอดปี — ไม่ใช้ Intl timeZone (บาง WebView/Chrome มือถือละเว้นแล้วแสดงเป็น UTC) */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * รูปแบบเดิมในแอป: "25 มี.ค. 2569 10:19"
 * @param {string|number|Date|null|undefined} value
 * @returns {string}
 */
export function formatThaiDateTimeBangkok(value) {
  const d = parseDbDateTime(value)
  if (!d || isNaN(d.getTime())) return '-'
  const shifted = new Date(d.getTime() + BANGKOK_OFFSET_MS)
  const day = shifted.getUTCDate()
  const month = shifted.getUTCMonth()
  const gregYear = shifted.getUTCFullYear()
  const thaiYear = gregYear + 543
  const hour = String(shifted.getUTCHours()).padStart(2, '0')
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${day} ${THAI_MONTH_SHORT[month]} ${thaiYear} ${hour}:${minute}`
}
