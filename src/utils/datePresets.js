/**
 * ยูทิลิตี้สำหรับช่วงวันที่และ preset "รูปแบบการค้นหา"
 * ใช้ร่วมกับ DateRangeFilter ในหลายหน้า (Dashboard, Orders, Reports, CreditHistory ฯลฯ)
 */

/** แปลง Date เป็นสตริง YYYY-MM-DD (ใช้กับ input type="date") */
export function toYmd(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** รายการ preset สำหรับปุ่ม "7 วันย้อนหลัง", "30 วันย้อนหลัง", "1 เดือนย้อนหลัง" */
export const DATE_PRESETS = [
  { label: '7 วันย้อนหลัง', days: 7 },
  { label: '30 วันย้อนหลัง', days: 30 },
  { label: '1 เดือนย้อนหลัง', days: -1 }
]

/**
 * คำนวณช่วงวันที่ของ preset
 * @param {number} days - 7, 30 หรือ -1 (เดือนก่อน)
 * @returns {{ start: string, end: string }} YYYY-MM-DD
 */
export function getPresetRange(days) {
  const today = new Date()
  let start, end
  if (days === -1) {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    end = new Date(today.getFullYear(), today.getMonth(), 0)
  } else {
    end = new Date(today)
    start = new Date(today)
    start.setDate(start.getDate() - days)
  }
  return { start: toYmd(start), end: toYmd(end) }
}
