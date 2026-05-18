/**
 * Hash และตรวจสอบรหัสผ่านด้วย bcrypt (ใช้ใน Register/Login)
 * รองรับรหัสผ่านเก่าที่เก็บแบบ plain ไว้เปรียบเทียบจนกว่าจะเปลี่ยนรหัสผ่าน
 */
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

/** ตรวจว่าเป็น bcrypt hash หรือไม่ (รหัสเก่าอาจเก็บแบบ plain) */
export function isBcryptHash(str) {
  return typeof str === 'string' && str.length >= 50 && (str.startsWith('$2a$') || str.startsWith('$2b$') || str.startsWith('$2y$'))
}

/**
 * Hash รหัสผ่านก่อนเก็บใน DB
 * @param {string} plainPassword
 * @returns {Promise<string>} bcrypt hash
 */
export async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('รหัสผ่านไม่ถูกต้อง')
  }
  return bcrypt.hash(plainPassword, SALT_ROUNDS)
}

/**
 * ตรวจสอบรหัสผ่านกับ hash ที่เก็บไว้
 * รองรับทั้งกรณีที่ DB เก็บ hash (bcrypt) และกรณีเก่าที่เก็บ plain (จะเปรียบเทียบแบบ plain)
 * @param {string} plainPassword - รหัสที่ user กรอก
 * @param {string|null|undefined} storedHash - ค่าใน DB (Password)
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || plainPassword === '') return false
  if (storedHash == null || storedHash === '') return false

  const stored = String(storedHash)
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plainPassword, stored)
  }
  // Legacy: เก็บแบบ plain (ไม่แนะนำ) – เปรียบเทียบแบบ plain แล้วค่อยอัปเดตเป็น hash เมื่อ user เปลี่ยนรหัสผ่าน
  return plainPassword === stored
}
