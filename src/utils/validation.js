/**
 * Validation และ sanitize ข้อมูลจากฟอร์ม (ลดความเสี่ยง XSS / ข้อมูลผิดรูปแบบ)
 * หมายเหตุ: การตรวจที่ server (Edge Function / API) จะช่วยป้องกันได้แน่นอนกว่า
 */

const MAX_EMAIL_LENGTH = 255
const MAX_USERNAME_LENGTH = 100
const MAX_PASSWORD_LENGTH = 128
const MAX_PHONE_LENGTH = 20
const MAX_ADDRESS_LENGTH = 500
const MAX_TEXT_FIELD = 1000

/** ตัดช่องว่างหัวท้าย และจำกัดความยาว */
export function sanitizeString(str, maxLen = MAX_TEXT_FIELD) {
  if (str == null) return ''
  const s = String(str).trim()
  return s.length > maxLen ? s.slice(0, maxLen) : s
}

/** ตรวจรูปแบบอีเมล */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false
  const trimmed = email.trim()
  if (trimmed.length > MAX_EMAIL_LENGTH) return false
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(trimmed)
}

/** ตรวจความแข็งแรงรหัสผ่าน (อย่างน้อย 8 ตัว, มีใหญ่ เล็ก ตัวเลข) */
export function isStrongPassword(password) {
  if (!password || typeof password !== 'string') return false
  if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) return false
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  return hasUpper && hasLower && hasNumber
}

/** ตรวจและ sanitize ค่าที่ใช้ในฟอร์มลงทะเบียน */
export function validateRegisterInput({ email, password, confirmPassword, username, phone, address }) {
  const errors = []
  const emailSanitized = sanitizeString(email, MAX_EMAIL_LENGTH)
  const usernameSanitized = sanitizeString(username, MAX_USERNAME_LENGTH)
  const phoneSanitized = sanitizeString(phone, MAX_PHONE_LENGTH)
  const addressSanitized = sanitizeString(address, MAX_ADDRESS_LENGTH)

  if (!isValidEmail(emailSanitized)) errors.push('อีเมลไม่ถูกต้องหรือยาวเกินไป')
  if (!isStrongPassword(password)) errors.push('รหัสผ่านต้องมีอย่างน้อย 8 ตัว อักษรใหญ่ เล็ก และตัวเลข')
  if (password !== confirmPassword) errors.push('รหัสผ่านกับยืนยันรหัสผ่านไม่ตรงกัน')
  if (usernameSanitized.length < 3) errors.push('ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      email: emailSanitized,
      username: usernameSanitized,
      phone: phoneSanitized || null,
      address: addressSanitized || null
    }
  }
}

/** ตรวจและ sanitize ค่าที่ใช้ในฟอร์มล็อกอิน */
export function validateLoginInput({ email, password }) {
  const emailSanitized = sanitizeString(email, MAX_EMAIL_LENGTH)
  const validEmail = isValidEmail(emailSanitized)
  const hasPassword = typeof password === 'string' && password.length > 0 && password.length <= MAX_PASSWORD_LENGTH
  return {
    valid: validEmail && hasPassword,
    sanitized: { email: emailSanitized }
  }
}
