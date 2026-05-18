import { supabase } from './supabase'

export function normalizeAddressPart(v) {
  const s = (v ?? '').toString().trim()
  if (!s || s.toUpperCase() === 'NULL') return ''
  return s
}

export function partsFromOrder(order = {}) {
  return {
    street: normalizeAddressPart(order.Address ?? order.address),
    sub: normalizeAddressPart(order.Subdistrict ?? order.subdistrict),
    dist: normalizeAddressPart(order.District ?? order.district),
    prov: normalizeAddressPart(order.Province ?? order.province),
    pc: normalizeAddressPart(order.PostalCode ?? order.postalcode ?? order['Postal Code'])
  }
}

export function shippingPartsFromUserRow(row) {
  if (!row) return { street: '', sub: '', dist: '', prov: '', pc: '' }
  return {
    street: normalizeAddressPart(row.Address ?? row.address),
    sub: normalizeAddressPart(row.Subdistrict ?? row.subdistrict),
    dist: normalizeAddressPart(row.District ?? row.district),
    prov: normalizeAddressPart(row.Province ?? row.province),
    pc: normalizeAddressPart(row.PostalCode ?? row.postalcode ?? row.postal_code)
  }
}

export function mergeAddressParts(primary, fallback) {
  const a = primary || {}
  const b = fallback || {}
  return {
    street: normalizeAddressPart(a.street) || normalizeAddressPart(b.street),
    sub: normalizeAddressPart(a.sub) || normalizeAddressPart(b.sub),
    dist: normalizeAddressPart(a.dist) || normalizeAddressPart(b.dist),
    prov: normalizeAddressPart(a.prov) || normalizeAddressPart(b.prov),
    pc: normalizeAddressPart(a.pc) || normalizeAddressPart(b.pc)
  }
}

/** บรรทัดแรก = ที่อยู่บรรทัดหลัก, บรรทัดถัดไป = ตำบล/แขวง เขต/อำเภอ จังหวัด รหัสไปรษณีย์ */
export function formatAddressMultiline(parts) {
  const { street, sub, dist, prov, pc } = parts || {}
  const tail = [sub, dist, prov, pc].filter(Boolean).join(' ')
  const lines = [normalizeAddressPart(street), tail].filter(Boolean)
  return lines.join('\n')
}

export async function fetchUserShippingPartsByEmail(userEmail) {
  if (!userEmail) return { street: '', sub: '', dist: '', prov: '', pc: '' }
  const cols = 'Address, Subdistrict, District, Province, PostalCode'
  let { data, error } = await supabase.from('users').select(cols).eq('Email', userEmail).maybeSingle()
  if (error || !data) {
    const r = await supabase.from('users').select(cols).eq('email', userEmail).maybeSingle()
    data = r.data
    error = r.error
  }
  if (error || !data) return { street: '', sub: '', dist: '', prov: '', pc: '' }
  return shippingPartsFromUserRow(data)
}

/**
 * ที่อยู่จัดส่งสำหรับพิมพ์: รวมจากออเดอร์ แล้วเติมช่องว่างจากตาราง users ตามอีเมลลูกค้า
 */
export async function resolveShippingAddressForPrint(order) {
  const userEmail = order.UserEmail || order.User || ''
  let merged = partsFromOrder(order)
  const missingTail =
    !normalizeAddressPart(merged.sub) ||
    !normalizeAddressPart(merged.dist) ||
    !normalizeAddressPart(merged.prov) ||
    !normalizeAddressPart(merged.pc)
  const missingStreet = !normalizeAddressPart(merged.street)
  if (userEmail && (missingTail || missingStreet)) {
    const fromUser = await fetchUserShippingPartsByEmail(userEmail)
    merged = mergeAddressParts(merged, fromUser)
  }
  const out = formatAddressMultiline(merged)
  return out || '-'
}
