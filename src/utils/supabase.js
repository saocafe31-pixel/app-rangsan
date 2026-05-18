import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY || '').trim()

if (!SUPABASE_URL || !SUPABASE_KEY) {
  const missing = []
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL')
  if (!SUPABASE_KEY) missing.push('VITE_SUPABASE_KEY')
  throw new Error(
    `[Supabase] ไม่พบตัวแปรสภาพแวดล้อม: ${missing.join(', ')}. ` +
    'เครื่องคุณ: สร้างไฟล์ .env.local (คัดลอกจาก .env.example) และใส่ค่าจาก Supabase Dashboard. ' +
    'Deploy บน Vercel: ไปที่ Project → Settings → Environment Variables แล้วเพิ่ม VITE_SUPABASE_URL และ VITE_SUPABASE_KEY (จาก Supabase Dashboard → Project Settings → API).'
  )
}

// ตรวจรูปแบบ URL ป้องกัน typo / ช่องว่าง (ไม่ log ค่าจริง)
const isValidSupabaseUrl = SUPABASE_URL.startsWith('https://') && SUPABASE_URL.includes('.supabase.co')
if (!isValidSupabaseUrl) {
  throw new Error(
    '[Supabase] รูปแบบ VITE_SUPABASE_URL ไม่ถูกต้อง ต้องขึ้นต้นด้วย https:// และมี .supabase.co ' +
    '(คัดลอกจาก Supabase Dashboard → Project Settings → API → Project URL โดยไม่เพิ่มช่องว่างหรือตัวอักษร)'
  )
}

// Log connection check (only in development, no secrets)
if (import.meta.env.DEV) {
  console.log('Supabase: เชื่อมต่อด้วย VITE_SUPABASE_URL และ VITE_SUPABASE_KEY จาก env')
}

// Hybrid storage: ใช้ cookie สำหรับค่าขนาดเล็ก (เช่น PKCE code verifier) เพื่อให้คงอยู่หลัง redirect บนมือถือ
// (Safari/Chrome บางครั้งล้าง localStorage เมื่อออกไปยังโดเมนอื่นแล้วกลับมา) + localStorage สำหรับค่าขนาดใหญ่
const AUTH_COOKIE_NAME = 'sb_auth_pkce'
const COOKIE_MAX = 3500

function getAuthCookie() {
  if (typeof document === 'undefined') return {}
  const prefix = AUTH_COOKIE_NAME + '='
  const part = document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(prefix))
  if (!part) return {}
  try {
    return JSON.parse(decodeURIComponent(part.slice(prefix.length))) || {}
  } catch {
    return {}
  }
}

function setAuthCookie(obj) {
  if (typeof document === 'undefined') return
  const s = JSON.stringify(obj)
  if (s.length > COOKIE_MAX) return
  document.cookie = AUTH_COOKIE_NAME + '=' + encodeURIComponent(s) + ';path=/;max-age=600;SameSite=Lax' + (location?.protocol === 'https:' ? ';Secure' : '')
}

const authStorage = (() => {
  try {
    const local = typeof localStorage !== 'undefined' ? localStorage : null
    if (!local) return undefined
    return {
      getItem(key) {
        const cookie = getAuthCookie()
        if (Object.prototype.hasOwnProperty.call(cookie, key)) return cookie[key]
        return local.getItem(key)
      },
      setItem(key, value) {
        const cookie = getAuthCookie()
        cookie[key] = value
        const len = JSON.stringify(cookie).length
        if (len <= COOKIE_MAX) setAuthCookie(cookie)
        local.setItem(key, value)
      },
      removeItem(key) {
        const cookie = getAuthCookie()
        delete cookie[key]
        setAuthCookie(cookie)
        local.removeItem(key)
      }
    }
  } catch {
    return undefined
  }
})()

// ใช้ implicit flow เพื่อไม่ต้องเก็บ code verifier — เหมาะเมื่อ Tracking Prevention (Edge) หรือ privacy บล็อก storage
// โทเค็นกลับมาใน URL #access_token=... แทน ?code= จึงไม่เกิด "PKCE code verifier not found"
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    ...(authStorage && { storage: authStorage })
  }
})
