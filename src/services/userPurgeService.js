/**
 * นับ/ลบข้อมูลที่ผูกกับอีเมลผู้ใช้ (แอดมิน)
 * ระวัง: ลบถาวร — ใช้ dry_run ก่อนเสมอ
 */
import { supabase } from '../utils/supabase'
import { invalidateByPrefix } from '../utils/cache'

export function normalizeEmail(email) {
  return String(email || '').trim()
}

const UNLOCK_KEY = 'admin_user_mgmt_unlocked_until'
const UNLOCK_TTL_MS = 2 * 60 * 60 * 1000 // 2 ชม.

export function isUserMgmtGateUnlocked() {
  const raw = sessionStorage.getItem(UNLOCK_KEY)
  if (!raw) return false
  const t = parseInt(raw, 10)
  return Number.isFinite(t) && t > Date.now()
}

export function setUserMgmtGateUnlocked() {
  sessionStorage.setItem(UNLOCK_KEY, String(Date.now() + UNLOCK_TTL_MS))
}

export function clearUserMgmtGate() {
  sessionStorage.removeItem(UNLOCK_KEY)
}

export async function verifyUserMgmtGate(verifierName, confirmationCode) {
  const name = String(verifierName || '').trim()
  const code = String(confirmationCode || '').trim()
  if (!name || !code) return { ok: false, message: 'กรอกชื่อและรหัสยืนยัน' }
  const { data, error } = await supabase.rpc('verify_admin_user_mgmt_access', {
    p_name: name,
    p_code: code
  })
  if (error) {
    console.error('[verifyUserMgmtGate]', error)
    return {
      ok: false,
      message:
        error.message?.includes('function') || error.code === '42883'
          ? 'ยังไม่ได้ติดตั้งฟังก์ชันยืนยันใน Supabase — รัน migration admin_user_mgmt_access'
          : error.message || 'ตรวจสอบไม่สำเร็จ'
    }
  }
  if (data === true) {
    setUserMgmtGateUnlocked()
    return { ok: true }
  }
  return { ok: false, message: 'ชื่อหรือรหัสยืนยันไม่ถูกต้อง' }
}

async function fetchOrderIdsForUser(email) {
  const e = normalizeEmail(email)
  if (!e) return []
  const ids = new Set()
  const add = (rows) => {
    ;(rows || []).forEach((r) => {
      const id = r.OrderID || r.orderid || r.order_id
      if (id) ids.add(String(id).trim())
    })
  }
  const { data: d1, error: e1 } = await supabase.from('order').select('OrderID').ilike('UserEmail', e)
  if (e1) throw new Error(e1.message)
  add(d1)
  const { data: d2 } = await supabase.from('order').select('orderid').ilike('useremail', e)
  add(d2)
  const { data: d3 } = await supabase.from('order').select('OrderID').ilike('User', e)
  add(d3)
  return [...ids]
}

async function countRows(table, filterFn) {
  try {
    let q = supabase.from(table).select('*', { count: 'exact', head: true })
    q = filterFn(q)
    const { count, error } = await q
    if (error) {
      console.warn(`[userPurge] count ${table}:`, error.message)
      return 0
    }
    return count || 0
  } catch (e) {
    console.warn(`[userPurge] count ${table}`, e)
    return 0
  }
}

async function deleteRows(table, filterFn) {
  let q = supabase.from(table).delete()
  q = filterFn(q)
  const { error } = await q
  if (error) throw new Error(`${table}: ${error.message}`)
}

/**
 * สรุปจำนวนแถวที่จะได้รับผลจากการลบแบบเต็ม (ประมาณการ — tax_invoices รวมซ้ำไม่นับ)
 */
export async function dryRunFullPurgeSummary(email) {
  const e = normalizeEmail(email)
  if (!e || !e.includes('@')) throw new Error('อีเมลไม่ถูกต้อง')

  const orderIds = await fetchOrderIdsForUser(e)

  let orderCount = await countRows('order', (q) => q.ilike('UserEmail', e))
  if (orderCount === 0) {
    orderCount = await countRows('order', (q) => q.ilike('useremail', e))
  }
  if (orderCount === 0) {
    orderCount = await countRows('order', (q) => q.ilike('User', e))
  }

  let taxCount = 0
  try {
    const { data: t1 } = await supabase.from('tax_invoices').select('id').ilike('useremail', e)
    const ids1 = new Set((t1 || []).map((r) => r.id))
    if (orderIds.length > 0) {
      const { data: t2 } = await supabase.from('tax_invoices').select('id').in('orderid', orderIds)
      ;(t2 || []).forEach((r) => ids1.add(r.id))
    }
    taxCount = ids1.size
  } catch (err) {
    console.warn('[dryRun] tax_invoices', err)
    taxCount = await countRows('tax_invoices', (q) => q.ilike('useremail', e))
  }

  const packingCount =
    orderIds.length > 0
      ? await countRows('order_packing', (q) => q.in('order_id', orderIds))
      : 0

  const usersCount = await countRows('users', (q) => q.ilike('Email', e))

  const userCredits = await countRows('user_credits', (q) => q.ilike('useremail', e))
  const notifications = await countRows('notifications', (q) => q.ilike('useremail', e))
  const userApprovals = await countRows('user_approvals', (q) => q.ilike('useremail', e))

  const poByCreator = await countRows('purchase_orders', (q) => q.ilike('createdby', e))
  let poItemsCount = 0
  if (poByCreator > 0) {
    try {
      const { data: poh } = await supabase.from('purchase_orders').select('poid').ilike('createdby', e)
      const poids = [...new Set((poh || []).map((r) => r.poid || r.POID).filter(Boolean))]
      if (poids.length) {
        const { count } = await supabase
          .from('po_items')
          .select('*', { count: 'exact', head: true })
          .in('poid', poids)
        poItemsCount = count || 0
      }
    } catch (_) {
      poItemsCount = 0
    }
  }

  const creditUsageLog = await countRows('credit_usage_log', (q) => q.ilike('useremail', e))
  const creditTransactions = await countRows('credit_transactions', (q) => q.ilike('useremail', e))
  const stockLogs = await countRows('stock_logs', (q) => q.ilike('useremail', e))
  const franchiseStockLogs = await countRows('franchise_stock_logs', (q) => q.ilike('useremail', e))

  return {
    mode: 'full_purge',
    email: e,
    dry_run: true,
    deleted: {
      order: orderCount,
      users: usersCount,
      tax_invoices: taxCount,
      user_credits: userCredits,
      notifications,
      user_approvals: userApprovals,
      purchase_orders: poByCreator,
      po_items: poItemsCount,
      credit_usage_log: creditUsageLog,
      credit_transactions: creditTransactions,
      order_packing: packingCount,
      stock_logs: stockLogs,
      franchise_stock_logs: franchiseStockLogs
    }
  }
}

/**
 * ลบเฉพาะแถว users (ออเดอร์และประวัติคงอยู่)
 */
export async function purgeUserOnly(email) {
  const e = normalizeEmail(email)
  if (!e) throw new Error('ไม่มีอีเมล')
  await deleteRows('users', (q) => q.ilike('Email', e))
  invalidateByPrefix('orders_')
  invalidateByPrefix('credit_')
  return { mode: 'user_only', email: e, users: 1 }
}

/**
 * ลบข้อมูลที่เกี่ยวข้องทั้งหมด (ลำดับลด FK)
 */
export async function purgeUserFull(email) {
  const e = normalizeEmail(email)
  if (!e) throw new Error('ไม่มีอีเมล')

  const orderIds = await fetchOrderIdsForUser(e)
  const snap = await dryRunFullPurgeSummary(e)
  const deleted = { ...snap.deleted }

  if (orderIds.length > 0) {
    await deleteRows('order_packing', (q) => q.in('order_id', orderIds))
  }

  if (orderIds.length > 0) {
    const { error: taxErr } = await supabase.from('tax_invoices').delete().in('orderid', orderIds)
    if (taxErr) throw new Error(`tax_invoices: ${taxErr.message}`)
  }
  await deleteRows('tax_invoices', (q) => q.ilike('useremail', e))

  await deleteRows('order', (q) => q.ilike('UserEmail', e))
  {
    const { error: eLo } = await supabase.from('order').delete().ilike('useremail', e)
    if (eLo) console.warn('[purge] order useremail:', eLo.message)
  }
  {
    const { error: eU } = await supabase.from('order').delete().ilike('User', e)
    if (eU) console.warn('[purge] order User:', eU.message)
  }

  await deleteRows('credit_usage_log', (q) => q.ilike('useremail', e))
  await deleteRows('credit_transactions', (q) => q.ilike('useremail', e))
  await deleteRows('user_credits', (q) => q.ilike('useremail', e))
  await deleteRows('notifications', (q) => q.ilike('useremail', e))
  await deleteRows('user_approvals', (q) => q.ilike('useremail', e))

  const { data: poHeaders } = await supabase.from('purchase_orders').select('poid').ilike('createdby', e)
  const poids = [...new Set((poHeaders || []).map((r) => r.poid || r.POID).filter(Boolean))]
  if (poids.length > 0) {
    await supabase.from('po_items').delete().in('poid', poids)
  }
  await deleteRows('purchase_orders', (q) => q.ilike('createdby', e))

  await deleteRows('stock_logs', (q) => q.ilike('useremail', e))
  await deleteRows('franchise_stock_logs', (q) => q.ilike('useremail', e))

  await deleteRows('users', (q) => q.ilike('Email', e))

  invalidateByPrefix('orders_')
  invalidateByPrefix('products_')
  invalidateByPrefix('credit_')

  return { mode: 'full_purge', email: e, dry_run: false, deleted }
}
