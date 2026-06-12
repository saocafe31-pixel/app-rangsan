export const THEME_COLOR = '#16a34a' // สีเขียว (green-600)

// Logo URLs จาก Supabase Storage (ใช้ VITE_SUPABASE_URL จาก env เท่านั้น)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const STORAGE_BASE = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public` : ''
/** โลโก้แอป + หน้าโหลด (bucket public / โฟลเดอร์ Logo) */
export const APP_LOGO_URL = STORAGE_BASE
  ? `${STORAGE_BASE}/Logo/571027217_713307025120993_3581334438282354191_n.jpg`
  : ''

/** localStorage ตะกร้า — คีย์เก่า sao_cafe_cart ยังอ่านได้ครั้งหนึ่งเพื่อย้ายข้อมูล */
export const CART_STORAGE_KEY = 'rangsan_cart'
export const LEGACY_CART_STORAGE_KEY = 'sao_cafe_cart'
export const LOGO_URL = STORAGE_BASE ? `${STORAGE_BASE}/company-assets/CHAIJUNLA%20CO.,%20LTD.%20(2).png` : ''

export const SHOP_INFO = {
  name: "บริษัท ไชยจันลา จำกัด (สำนักงานใหญ่)",
  address: "เลขที่ 966 ถนนประชาราษฎร์ 1 แขวงบางซื่อ เขตบางซื่อ กรุงเทพมหานคร 10800",
  phone: "094-038-0836",
  taxId: "0 1055 67121 92 9",
  signature: ""
}

export const SHOP_ADDRESS_TEXT = `บริษัท ไชยจันลา จำกัด (สำนักงานใหญ่) 
966 ถนนประชาราษฎร์1 แขวงบางซื่อ เขตบางซื่อ กรุงเทพ 10800 
โทร. 061-732-1346 
เลขประจำตัวผู้เสียภาษี 0105567121929`

/** TTL cache หลัก (products, orders) – 5 นาที */
export const CACHE_DURATION = 5 * 60 * 1000
/** TTL cache ยอดเครดิต – 1 นาที (invalidate เมื่อมีการเติม/หัก) */
export const CREDIT_CACHE_TTL = 1 * 60 * 1000
