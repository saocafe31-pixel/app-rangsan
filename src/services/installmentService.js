import { supabase } from '../utils/supabase'

const SETTINGS_KEY = 'installment_payments'
const SETTINGS_CACHE_MS = 2 * 60 * 1000
const DEFAULT_SETTINGS = {
  enabled: false,
  allowedEmails: [],
  reminderDaysBefore: [3, 2]
}

let settingsCached = null
let settingsCachedAt = 0

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function uniqueEmails(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\s,;\n]+/)
        .filter(Boolean)
  return [...new Set(source.map(normalizeEmail).filter(Boolean))]
}

function uniqueReminderDays(value) {
  const source = Array.isArray(value) ? value : DEFAULT_SETTINGS.reminderDaysBefore
  const days = source
    .map((v) => Math.max(0, Math.round(Number(v) || 0)))
    .filter((v) => v > 0)
  const uniq = [...new Set(days)]
  return uniq.length > 0 ? uniq : DEFAULT_SETTINGS.reminderDaysBefore
}

function isMissingInstallmentTableError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('installment_plans') ||
    message.includes('installment_payments') ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  )
}

function migrationRequiredError(error) {
  const message = error?.message || error || 'ไม่พบตารางแบ่งชำระ'
  return new Error(`ยังไม่ได้รัน migration สำหรับฟีเจอร์แบ่งชำระ: ${message}`)
}

function toIsoOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toDateOnlyOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function isPastDate(value) {
  const dateOnly = toDateOnlyOrNull(value)
  if (!dateOnly) return false
  const today = new Date().toISOString().slice(0, 10)
  return dateOnly < today
}

export function roundMoney(value) {
  const n = Number(value) || 0
  return Math.round(n * 100) / 100
}

export function calculateInstallmentAmounts(totalAmount, depositPercent, paidAmount = 0, dueDate = null) {
  const total = Math.max(0, roundMoney(totalAmount))
  const percent = Math.min(100, Math.max(0, roundMoney(depositPercent)))
  const deposit = roundMoney((total * percent) / 100)
  const paid = Math.min(total, Math.max(0, roundMoney(paidAmount)))
  const remaining = roundMoney(Math.max(0, total - paid))
  const paymentStatus =
    remaining <= 0
      ? 'paid'
      : paid > 0
        ? 'partial'
        : isPastDate(dueDate)
          ? 'overdue'
          : 'pending'

  return {
    totalAmount: total,
    depositPercent: percent,
    depositAmount: deposit,
    paidAmount: paid,
    remainingAmount: remaining,
    paymentStatus
  }
}

export function normalizeInstallmentPlan(row) {
  if (!row) return null
  const totalAmount = roundMoney(row.total_amount ?? row.totalAmount ?? 0)
  const paidAmount = Math.min(totalAmount, Math.max(0, roundMoney(row.paid_amount ?? row.paidAmount ?? 0)))
  const remainingAmount = roundMoney(Math.max(0, totalAmount - paidAmount))

  return {
    id: row.id,
    orderId: String(row.orderid ?? row.orderId ?? ''),
    userEmail: String(row.useremail ?? row.userEmail ?? ''),
    totalAmount,
    depositPercent: roundMoney(row.deposit_percent ?? row.depositPercent ?? 0),
    depositAmount: roundMoney(row.deposit_amount ?? row.depositAmount ?? 0),
    paidAmount,
    remainingAmount,
    paymentStatus: row.payment_status || row.paymentStatus || calculateInstallmentAmounts(totalAmount, 0, paidAmount, row.due_date).paymentStatus,
    dueDate: row.due_date || row.dueDate || null,
    paidAt: row.paid_at || row.paidAt || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.createdat || row.createdAt || null,
    updatedAt: row.updatedat || row.updatedAt || null,
    raw: row
  }
}

export function normalizeInstallmentPayment(row) {
  if (!row) return null
  return {
    id: row.id,
    planId: row.plan_id ?? row.planId,
    orderId: String(row.orderid ?? row.orderId ?? ''),
    userEmail: String(row.useremail ?? row.userEmail ?? ''),
    amount: roundMoney(row.amount || 0),
    paymentMethod: row.payment_method || row.paymentMethod || 'transfer',
    slipURL: row.slipurl || row.slipURL || row.SlipURL || null,
    note: row.note || '',
    recordedBy: row.recorded_by || row.recordedBy || null,
    paidAt: row.paid_at || row.paidAt || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.createdat || row.createdAt || null,
    raw: row
  }
}

function normalizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: value.enabled === true,
    allowedEmails: uniqueEmails(value.allowedEmails || value.allowed_emails || []),
    reminderDaysBefore: uniqueReminderDays(value.reminderDaysBefore || value.reminder_days_before)
  }
}

export const installmentService = {
  async getSettings() {
    const now = Date.now()
    if (settingsCached && now - settingsCachedAt < SETTINGS_CACHE_MS) return settingsCached

    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle()

      if (error) throw error
      settingsCached = normalizeSettings(data?.value)
      settingsCachedAt = now
      return settingsCached
    } catch (error) {
      console.warn('[installmentService] getSettings failed, using defaults:', error.message || error)
      settingsCached = { ...DEFAULT_SETTINGS }
      settingsCachedAt = now
      return settingsCached
    }
  },

  clearSettingsCache() {
    settingsCached = null
    settingsCachedAt = 0
  },

  async isInstallmentAllowedForUser(userEmail) {
    const email = normalizeEmail(userEmail)
    if (!email) return false
    const settings = await this.getSettings()
    return settings.enabled === true && settings.allowedEmails.includes(email)
  },

  async getPlanByOrderId(orderId) {
    const id = String(orderId || '').trim()
    if (!id) return null

    const { data, error } = await supabase
      .from('installment_plans')
      .select('*')
      .eq('orderid', id)
      .maybeSingle()

    if (error) {
      if (isMissingInstallmentTableError(error)) return null
      throw new Error(error.message || 'ไม่สามารถดึงข้อมูลแบ่งชำระได้')
    }

    return normalizeInstallmentPlan(data)
  },

  async getPlansByOrderIds(orderIds) {
    const ids = [...new Set((orderIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
    if (ids.length === 0) return new Map()

    const { data, error } = await supabase
      .from('installment_plans')
      .select('*')
      .in('orderid', ids)

    if (error) {
      if (isMissingInstallmentTableError(error)) return new Map()
      throw new Error(error.message || 'ไม่สามารถดึงข้อมูลแบ่งชำระได้')
    }

    const map = new Map()
    ;(data || []).forEach((row) => {
      const plan = normalizeInstallmentPlan(row)
      if (plan?.orderId) map.set(plan.orderId, plan)
    })
    return map
  },

  async getPaymentsByPlanIds(planIds) {
    const ids = [...new Set((planIds || []).map((id) => Number(id)).filter(Boolean))]
    if (ids.length === 0) return new Map()

    const { data, error } = await supabase
      .from('installment_payments')
      .select('*')
      .in('plan_id', ids)
      .order('paid_at', { ascending: true })

    if (error) {
      if (isMissingInstallmentTableError(error)) return new Map()
      throw new Error(error.message || 'ไม่สามารถดึงรายการชำระแบ่งชำระได้')
    }

    const map = new Map()
    ;(data || []).forEach((row) => {
      const payment = normalizeInstallmentPayment(row)
      if (!payment?.planId) return
      const key = Number(payment.planId)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(payment)
    })
    return map
  },

  async createPlan({
    orderId,
    userEmail,
    totalAmount,
    depositPercent,
    dueDate,
    metadata = {},
    initialPayment = null
  }) {
    const id = String(orderId || '').trim()
    const email = String(userEmail || '').trim()
    if (!id) throw new Error('ไม่พบเลขที่ออเดอร์สำหรับสร้างแผนแบ่งชำระ')
    if (!email) throw new Error('ไม่พบอีเมลลูกค้าสำหรับสร้างแผนแบ่งชำระ')

    const amounts = calculateInstallmentAmounts(totalAmount, depositPercent, 0, dueDate)
    const { data, error } = await supabase
      .from('installment_plans')
      .insert({
        orderid: id,
        useremail: email,
        total_amount: amounts.totalAmount,
        deposit_percent: amounts.depositPercent,
        deposit_amount: amounts.depositAmount,
        paid_amount: 0,
        payment_status: amounts.paymentStatus,
        due_date: toDateOnlyOrNull(dueDate),
        metadata
      })
      .select('*')
      .single()

    if (error) {
      if (isMissingInstallmentTableError(error)) throw migrationRequiredError(error)
      throw new Error(error.message || 'ไม่สามารถสร้างแผนแบ่งชำระได้')
    }

    const plan = normalizeInstallmentPlan(data)
    const initialAmount = roundMoney(initialPayment?.amount || 0)
    if (plan && initialAmount > 0) {
      const result = await this.recordPayment({
        planId: plan.id,
        orderId: id,
        userEmail: email,
        amount: initialAmount,
        paymentMethod: initialPayment.paymentMethod || 'transfer',
        slipURL: initialPayment.slipURL || null,
        note: initialPayment.note || 'ชำระงวดแรก',
        recordedBy: initialPayment.recordedBy || email,
        paidAt: initialPayment.paidAt || new Date().toISOString(),
        metadata: initialPayment.metadata || {}
      })
      await this.createReminderSchedules(result.plan)
      return result.plan
    }

    await this.createReminderSchedules(plan)
    return plan
  },

  async recordPayment({
    planId = null,
    orderId = '',
    userEmail = '',
    amount,
    paymentMethod = 'transfer',
    slipURL = null,
    note = '',
    recordedBy = null,
    paidAt = new Date().toISOString(),
    metadata = {}
  }) {
    const paymentAmount = roundMoney(amount)
    if (paymentAmount <= 0) throw new Error('ยอดชำระต้องมากกว่า 0')

    let plan = null
    if (planId) {
      const { data, error } = await supabase
        .from('installment_plans')
        .select('*')
        .eq('id', planId)
        .maybeSingle()
      if (error) {
        if (isMissingInstallmentTableError(error)) throw migrationRequiredError(error)
        throw new Error(error.message || 'ไม่พบแผนแบ่งชำระ')
      }
      plan = normalizeInstallmentPlan(data)
    } else {
      plan = await this.getPlanByOrderId(orderId)
    }

    if (!plan?.id) throw new Error('ไม่พบแผนแบ่งชำระของออเดอร์นี้')

    const { data, error } = await supabase
      .from('installment_payments')
      .insert({
        plan_id: plan.id,
        orderid: plan.orderId,
        useremail: userEmail || plan.userEmail,
        amount: paymentAmount,
        payment_method: paymentMethod,
        slipurl: slipURL,
        note: note || null,
        recorded_by: recordedBy || null,
        paid_at: toIsoOrNull(paidAt) || new Date().toISOString(),
        metadata
      })
      .select('*')
      .single()

    if (error) {
      if (isMissingInstallmentTableError(error)) throw migrationRequiredError(error)
      throw new Error(error.message || 'ไม่สามารถบันทึกยอดชำระได้')
    }

    const updatedPlan = await this.refreshPlanTotals(plan.id)
    return {
      payment: normalizeInstallmentPayment(data),
      plan: updatedPlan
    }
  },

  async refreshPlanTotals(planId) {
    const { data: planData, error: planError } = await supabase
      .from('installment_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle()

    if (planError) {
      if (isMissingInstallmentTableError(planError)) throw migrationRequiredError(planError)
      throw new Error(planError.message || 'ไม่พบแผนแบ่งชำระ')
    }

    const plan = normalizeInstallmentPlan(planData)
    if (!plan) throw new Error('ไม่พบแผนแบ่งชำระ')

    const { data: payments, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('amount')
      .eq('plan_id', plan.id)

    if (paymentsError) {
      if (isMissingInstallmentTableError(paymentsError)) throw migrationRequiredError(paymentsError)
      throw new Error(paymentsError.message || 'ไม่สามารถคำนวณยอดชำระได้')
    }

    const paid = roundMoney((payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0))
    const amounts = calculateInstallmentAmounts(plan.totalAmount, plan.depositPercent, paid, plan.dueDate)
    const nextStatus = plan.paymentStatus === 'cancelled' ? 'cancelled' : amounts.paymentStatus
    const nextPaidAt = nextStatus === 'paid' ? (plan.paidAt || new Date().toISOString()) : null

    const { data, error } = await supabase
      .from('installment_plans')
      .update({
        paid_amount: amounts.paidAmount,
        payment_status: nextStatus,
        paid_at: nextPaidAt
      })
      .eq('id', plan.id)
      .select('*')
      .single()

    if (error) throw new Error(error.message || 'ไม่สามารถอัปเดตยอดแบ่งชำระได้')
    return normalizeInstallmentPlan(data)
  },

  async cancelPlan(orderId, metadata = {}) {
    const id = String(orderId || '').trim()
    if (!id) throw new Error('ไม่พบเลขที่ออเดอร์')

    const { data, error } = await supabase
      .from('installment_plans')
      .update({
        payment_status: 'cancelled',
        metadata
      })
      .eq('orderid', id)
      .select('*')
      .maybeSingle()

    if (error) {
      if (isMissingInstallmentTableError(error)) return null
      throw new Error(error.message || 'ไม่สามารถยกเลิกแผนแบ่งชำระได้')
    }

    return normalizeInstallmentPlan(data)
  },

  async createReminderSchedules(plan, reminderDaysBefore = null) {
    if (!plan?.id || !plan?.dueDate) return []
    const days = uniqueReminderDays(reminderDaysBefore || (await this.getSettings()).reminderDaysBefore)
    const due = new Date(plan.dueDate)
    if (Number.isNaN(due.getTime())) return []

    const rows = days.map((daysBefore) => {
      const scheduled = new Date(due)
      scheduled.setDate(scheduled.getDate() - daysBefore)
      return {
        plan_id: plan.id,
        orderid: plan.orderId,
        useremail: plan.userEmail,
        reminder_days_before: daysBefore,
        scheduled_for: scheduled.toISOString().slice(0, 10),
        status: 'pending',
        metadata: {}
      }
    })

    const { data, error } = await supabase
      .from('installment_reminders')
      .upsert(rows, { onConflict: 'plan_id,reminder_days_before,scheduled_for' })
      .select('*')

    if (error) {
      if (isMissingInstallmentTableError(error)) return []
      throw new Error(error.message || 'ไม่สามารถสร้างตารางแจ้งเตือนแบ่งชำระได้')
    }

    return data || []
  }
}
