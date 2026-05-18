import { supabase } from '../utils/supabase'

/**
 * รายชื่อลูกค้าในระบบสำหรับแอดมินเลือกอีเมล (จำกัดผู้เห็นสินค้า)
 * ไม่รวมบัญชี Role = admin
 */
export async function fetchCustomersForVisibilityPicker() {
  const { data, error } = await supabase
    .from('users')
    .select(
      'Email, Username, UserType, Role, Address, Phone, Subdistrict, District, Province, PostalCode'
    )
    .order('Email', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data || []).map((row) => {
    const email = String(row.Email || row.email || '').trim()
    const username = String(row.Username || row.username || '').trim()
    const userType = String(row.UserType || row.usertype || 'regular').toLowerCase()
    const role = String(row.Role || row.role || '').toLowerCase()
    const displayName = username || (email ? email.split('@')[0] : '')
    const typeLabel = userType === 'franchise' ? 'แฟรนไชส์' : 'ทั่วไป'
    const shipAddr =
      String(row.Address || row.address || row.AddressLine || row.address_line || '').trim()
    const shipPhone = String(row.Phone || row.phone || '').trim()
    const shipSub = String(row.Subdistrict || row.subdistrict || '').trim()
    const shipDist = String(row.District || row.district || '').trim()
    const shipProv = String(row.Province || row.province || '').trim()
    const shipPostal = String(
      row.PostalCode || row.postalcode || row.postal_code || ''
    ).trim()
    return {
      email,
      username: displayName,
      userType,
      role,
      typeLabel,
      optionLabel: email ? `${displayName} — ${email} (${typeLabel})` : '',
      /** ดึงจากแถวเดียวกับรายชื่อ — ใช้เติมฟอร์มจัดส่งทันทีเมื่อเลือกลูกค้า */
      shippingSnapshot: {
        address: shipAddr,
        phone: shipPhone,
        subdistrict: shipSub,
        district: shipDist,
        province: shipProv,
        postalCode: shipPostal
      }
    }
  })

  const seen = new Set()
  return rows.filter((r) => {
    if (!r.email) return false
    if (r.role === 'admin') return false
    const k = r.email.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
