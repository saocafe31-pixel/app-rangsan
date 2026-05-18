import { supabase } from '../utils/supabase'
import { SHOP_INFO } from '../utils/constants'

const CACHE_MS = 2 * 60 * 1000 // 2 นาที
let cached = null
let cachedAt = 0

/**
 * ดึงข้อมูลร้านจาก settings key 'shop' แล้ว merge กับค่าเริ่มต้นจาก constants
 * ใช้ในใบเสร็จ ใบกำกับ ใบปะหน้าพัสดุ
 */
export async function getShopInfo() {
  const now = Date.now()
  if (cached && now - cachedAt < CACHE_MS) {
    return cached
  }
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'shop')
      .maybeSingle()
    if (error) throw error
    const raw = (data?.value && typeof data.value === 'object') ? data.value : {}
    const packingBoxW = Number(raw.packingBoxWeightKg)
    const rawBySize = raw.packingBoxWeightBySize
    const packingBoxWeightBySize = {}
    if (rawBySize && typeof rawBySize === 'object') {
      Object.keys(rawBySize).forEach((k) => {
        const n = Number(rawBySize[k])
        if (Number.isFinite(n) && n >= 0) packingBoxWeightBySize[k] = n
      })
    }
    cached = {
      name: raw.name ?? SHOP_INFO.name,
      address: raw.address ?? SHOP_INFO.address,
      phone: raw.phone ?? SHOP_INFO.phone,
      taxId: raw.taxId ?? SHOP_INFO.taxId,
      signature: raw.signature ?? SHOP_INFO.signature,
      email: raw.email ?? '',
      line: raw.line ?? '',
      packingBoxWeightKg: Number.isFinite(packingBoxW) && packingBoxW >= 0 ? packingBoxW : 0,
      packingBoxWeightBySize
    }
    cachedAt = now
    return cached
  } catch (e) {
    console.warn('[shopSettingsService] getShopInfo failed, using defaults:', e)
    cached = {
      name: SHOP_INFO.name,
      address: SHOP_INFO.address,
      phone: SHOP_INFO.phone,
      taxId: SHOP_INFO.taxId,
      signature: SHOP_INFO.signature,
      email: '',
      line: '',
      packingBoxWeightKg: 0,
      packingBoxWeightBySize: {}
    }
    cachedAt = now
    return cached
  }
}

/** ล้าง cache (เรียกหลังแอดมินบันทึกข้อมูลร้าน) */
export function clearShopInfoCache() {
  cached = null
  cachedAt = 0
}

const DEFAULT_PACKING_BOX_SIZES = ['A2', 'B2', 'C+8', 'M', 'M+', 'H']

/**
 * ดึงรายการไซส์กล่องสำหรับแพ็กสินค้า (จาก settings key 'packingBoxSizes')
 * ใช้ในหน้าจัดการออเดอร์ > กำลังจัดเตรียม > แพ็กสินค้า
 */
export async function getPackingBoxSizes() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'packingBoxSizes')
      .maybeSingle()
    if (error) throw error
    const v = data?.value
    if (Array.isArray(v) && v.length > 0) return v
    return DEFAULT_PACKING_BOX_SIZES
  } catch (e) {
    console.warn('[shopSettingsService] getPackingBoxSizes failed:', e)
    return DEFAULT_PACKING_BOX_SIZES
  }
}

const VAT_CACHE_MS = 2 * 60 * 1000
let vatCached = null
let vatCachedAt = 0

/**
 * ดึงอัตราภาษีมูลค่าเพิ่ม (เปอร์เซ็นต์) จาก settings key 'vat'
 * คืนค่า 0–100 (เช่น 7 = 7%), ค่าเริ่มต้น 7
 */
export async function getVatRate() {
  const now = Date.now()
  if (vatCached != null && now - vatCachedAt < VAT_CACHE_MS) {
    return vatCached
  }
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'vat')
      .maybeSingle()
    if (error) throw error
    const v = data?.value
    const rate = typeof v === 'number' ? Math.max(0, Math.min(100, v)) : (typeof v === 'string' ? parseFloat(v) : 7)
    vatCached = Number.isFinite(rate) ? rate : 7
    vatCachedAt = now
    return vatCached
  } catch (e) {
    console.warn('[shopSettingsService] getVatRate failed, using 7%:', e)
    vatCached = 7
    vatCachedAt = now
    return 7
  }
}

/** คำนวณ VAT และมูลค่าก่อนภาษี จากยอดรวม (รวมภาษีแล้ว) */
export function calcVatFromTotal(total, ratePercent) {
  const rate = Number(ratePercent) || 0
  if (rate <= 0) return { vat: 0, preVat: total }
  const vat = Math.round((total * rate / (100 + rate)) * 100) / 100
  const preVat = Math.round((total - vat) * 100) / 100
  return { vat, preVat }
}

/** ล้าง cache อัตราภาษี (เรียกหลังแอดมินบันทึกตั้งค่า vat) */
export function clearVatCache() {
  vatCached = null
  vatCachedAt = 0
}

const MAINTENANCE_CACHE_MS = 1 * 60 * 1000 // 1 นาที
let maintenanceCached = null
let maintenanceCachedAt = 0

/**
 * ดึงโหมดบำรุงรักษา จาก settings key 'maintenance'
 * คืนค่า { enabled: boolean, message: string }
 */
export async function getMaintenanceSettings() {
  const now = Date.now()
  if (maintenanceCached != null && now - maintenanceCachedAt < MAINTENANCE_CACHE_MS) {
    return maintenanceCached
  }
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'maintenance')
      .maybeSingle()
    if (error) throw error
    const raw = data?.value && typeof data.value === 'object' ? data.value : {}
    maintenanceCached = {
      enabled: !!raw.enabled,
      message: typeof raw.message === 'string' ? raw.message.trim() : 'กำลังปรับปรุงระบบ กรุณาลองใหม่ในภายหลัง'
    }
    maintenanceCachedAt = now
    return maintenanceCached
  } catch (e) {
    console.warn('[shopSettingsService] getMaintenanceSettings failed:', e)
    maintenanceCached = { enabled: false, message: '' }
    maintenanceCachedAt = now
    return maintenanceCached
  }
}

export function clearMaintenanceCache() {
  maintenanceCached = null
  maintenanceCachedAt = 0
}

const FEATURES_CACHE_MS = 2 * 60 * 1000
let featuresCached = null
let featuresCachedAt = 0

/** ดึงฟีเจอร์เปิด/ปิด จาก settings key 'features' */
export async function getFeaturesSettings() {
  const now = Date.now()
  if (featuresCached != null && now - featuresCachedAt < FEATURES_CACHE_MS) return featuresCached
  try {
    const { data, error } = await supabase.from('settings').select('value').eq('key', 'features').maybeSingle()
    if (error) throw error
    const raw = (data?.value && typeof data.value === 'object') ? data.value : {}
    featuresCached = {
      showCreditTopUp: raw.showCreditTopUp !== false,
      allowCoupon: raw.allowCoupon !== false,
      allowPromotion: raw.allowPromotion !== false
    }
    featuresCachedAt = now
    return featuresCached
  } catch (e) {
    console.warn('[shopSettingsService] getFeaturesSettings failed:', e)
    featuresCached = { showCreditTopUp: true, allowCoupon: true, allowPromotion: true }
    featuresCachedAt = now
    return featuresCached
  }
}

export function clearFeaturesCache() {
  featuresCached = null
  featuresCachedAt = 0
}

const NOTIFICATIONS_CACHE_MS = 2 * 60 * 1000
let notificationsCached = null
let notificationsCachedAt = 0

/** ดึงการแจ้งเตือน/ขีดจำกัด จาก settings key 'notifications' */
export async function getNotificationsSettings() {
  const now = Date.now()
  if (notificationsCached != null && now - notificationsCachedAt < NOTIFICATIONS_CACHE_MS) return notificationsCached
  try {
    const { data, error } = await supabase.from('settings').select('value').eq('key', 'notifications').maybeSingle()
    if (error) throw error
    const raw = (data?.value && typeof data.value === 'object') ? data.value : {}
    const threshold = raw.lowStockThreshold
    const n = typeof threshold === 'number' ? Math.max(0, threshold) : (typeof threshold === 'string' ? parseInt(threshold, 10) : 5)
    notificationsCached = {
      lowStockThreshold: Number.isFinite(n) ? n : 5,
      orderAlertEmail: typeof raw.orderAlertEmail === 'string' ? raw.orderAlertEmail.trim() : ''
    }
    notificationsCachedAt = now
    return notificationsCached
  } catch (e) {
    console.warn('[shopSettingsService] getNotificationsSettings failed:', e)
    notificationsCached = { lowStockThreshold: 5, orderAlertEmail: '' }
    notificationsCachedAt = now
    return notificationsCached
  }
}

export function clearNotificationsCache() {
  notificationsCached = null
  notificationsCachedAt = 0
}

/** ดึงข้อความต้อนรับและท้ายหน้า จาก settings keys welcome_message, footer_text */
export async function getUiTexts() {
  try {
    const { data, error } = await supabase.from('settings').select('key, value').in('key', ['welcome_message', 'footer_text'])
    if (error) throw error
    const rows = data || []
    const welcome = rows.find(r => r.key === 'welcome_message')
    const footer = rows.find(r => r.key === 'footer_text')
    return {
      welcome_message: typeof welcome?.value === 'string' ? welcome.value.trim() : '',
      footer_text: typeof footer?.value === 'string' ? footer.value.trim() : ''
    }
  } catch (e) {
    console.warn('[shopSettingsService] getUiTexts failed:', e)
    return { welcome_message: '', footer_text: '' }
  }
}
