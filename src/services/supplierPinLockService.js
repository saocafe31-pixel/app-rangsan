/**
 * ล็อกซัพพลายด้วย PIN — หน้า "สั่งสินค้าซัพอื่น" จะถาม PIN ก่อนแสดงรายการซัพที่ถูกล็อก
 */
import { supabase } from '../utils/supabase'

const TABLE = 'supplier_pin_locks'
const UNLOCK_STORAGE_KEY = 'supplier_pin_unlocked'

export const supplierPinLockService = {
  /**
   * ดึงรายการซัพที่ถูกล็อก (เฉพาะชื่อ — ใช้ตรวจว่าต้องถาม PIN หรือไม่)
   */
  async getLockedSupplierNames() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('supplier_name')
    if (error) throw new Error(error.message || 'ไม่สามารถดึงรายการล็อกได้')
    return (data || []).map((r) => (r.supplier_name || '').toString().trim()).filter(Boolean)
  },

  /**
   * ดึงรายการล็อกทั้งหมด (สำหรับหน้าแอดมิน: id, supplier_name, created_at)
   */
  async getAll() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, supplier_name, created_at')
      .order('supplier_name')
    if (error) throw new Error(error.message || 'ไม่สามารถดึงรายการล็อกได้')
    return data || []
  },

  /**
   * ตรวจสอบ PIN — เรียก RPC
   */
  async checkPin(supplierName, pin) {
    const { data, error } = await supabase.rpc('check_supplier_pin', {
      p_supplier_name: String(supplierName ?? '').trim(),
      p_pin: String(pin ?? '').trim()
    })
    if (error) throw new Error(error.message || 'ตรวจสอบ PIN ไม่สำเร็จ')
    return data === true
  },

  /**
   * สร้างหรืออัปเดตล็อก (แอดมิน) — ใส่ชื่อซัพ + รหัส PIN
   */
  async upsertLock(supplierName, pin) {
    const name = String(supplierName ?? '').trim()
    const pinStr = String(pin ?? '').trim()
    if (!name || !pinStr) throw new Error('กรุณาระบุชื่อซัพพลายและรหัส PIN')
    const { data, error } = await supabase.rpc('upsert_supplier_pin_lock', {
      p_supplier_name: name,
      p_pin: pinStr
    })
    if (error) throw new Error(error.message || 'บันทึกล็อกไม่สำเร็จ')
    return { id: data }
  },

  /**
   * ลบล็อก (แอดมิน)
   */
  async deleteLock(id) {
    const { error } = await supabase.rpc('delete_supplier_pin_lock', { p_id: id })
    if (error) throw new Error(error.message || 'ลบล็อกไม่สำเร็จ')
  },

  /**
   * เก็บว่าสาขาได้ใส่ PIN ถูกสำหรับซัพนี้แล้ว (sessionStorage — หมดเมื่อปิดแท็บ)
   */
  markUnlocked(supplierName) {
    try {
      const key = UNLOCK_STORAGE_KEY
      const raw = sessionStorage.getItem(key)
      const set = new Set(raw ? JSON.parse(raw) : [])
      set.add(String(supplierName ?? '').trim())
      sessionStorage.setItem(key, JSON.stringify([...set]))
    } catch (_) {}
  },

  isUnlockedInSession(supplierName) {
    try {
      const raw = sessionStorage.getItem(UNLOCK_STORAGE_KEY)
      if (!raw) return false
      const set = new Set(JSON.parse(raw))
      return set.has(String(supplierName ?? '').trim())
    } catch {
      return false
    }
  },

  clearUnlockedSession() {
    try {
      sessionStorage.removeItem(UNLOCK_STORAGE_KEY)
    } catch (_) {}
  }
}
