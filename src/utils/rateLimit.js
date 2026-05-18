/**
 * Rate limiting แบบ client-side สำหรับ Login / Register
 * จำกัดจำนวนครั้งต่อช่วงเวลา (ลดความเสี่ยง brute force จากเบราว์เซอร์เดียวกัน)
 * หมายเหตุ: การจำกัดที่ server/Edge Function จะแข็งแกร่งกว่า
 */

const WINDOW_MS = 2 * 60 * 1000 // 2 นาที
const MAX_ATTEMPTS = 5

const store = {
  login: { count: 0, resetAt: 0 },
  register: { count: 0, resetAt: 0 }
}

function now() {
  return Date.now()
}

/**
 * ตรวจว่าเกินโควต้าหรือยัง (ไม่เพิ่ม count)
 * @param {'login'|'register'} key
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(key) {
  const entry = store[key] || { count: 0, resetAt: 0 }
  const nowMs = now()
  if (nowMs >= entry.resetAt) {
    return { allowed: true, remaining: MAX_ATTEMPTS, resetAt: nowMs + WINDOW_MS }
  }
  const remaining = Math.max(0, MAX_ATTEMPTS - entry.count)
  return {
    allowed: remaining > 0,
    remaining,
    resetAt: entry.resetAt
  }
}

/**
 * บันทึกว่ามีการพยายามอีก 1 ครั้ง (เรียกหลังตรวจสอบ allowed แล้ว)
 * @param {'login'|'register'} key
 */
export function consumeRateLimit(key) {
  const entry = store[key] || { count: 0, resetAt: 0 }
  const nowMs = now()
  if (nowMs >= entry.resetAt) {
    store[key] = { count: 1, resetAt: nowMs + WINDOW_MS }
    return
  }
  entry.count = (entry.count || 0) + 1
  store[key] = entry
}

/**
 * รีเซ็ต (ใช้เมื่อ login/register สำเร็จ เพื่อไม่ให้ block การลองครั้งถัดไป)
 * @param {'login'|'register'} key
 */
export function resetRateLimit(key) {
  store[key] = { count: 0, resetAt: 0 }
}
