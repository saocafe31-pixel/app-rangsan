/**
 * creditService – จัดการเครดิตผู้ใช้ (ยอดคงเหลือ, รายการเติมเงิน, การอนุมัติ, usage logs)
 */
import { supabase } from '../utils/supabase'
import { getCached, setCached, invalidateByPrefix } from '../utils/cache'
import { CREDIT_CACHE_TTL } from '../utils/constants'

const CREDIT_CACHE_PREFIX = 'credit_'

export const creditService = {
  /** ดึงยอดเครดิตคงเหลือจาก user_credits (มี cache TTL สั้น, invalidate เมื่อมีการอัปเดต) */
  async getUserCredit(userEmail) {
    const key = CREDIT_CACHE_PREFIX + (userEmail || '').toLowerCase()
    const cached = getCached(key)
    if (cached != null) return cached

    try {
      const { data, error } = await supabase
        .from('user_credits')
        .select('*')
        .eq('useremail', userEmail)
        .maybeSingle()

      if (error) {
        console.error('Error fetching user credit:', error)
        const fallback = { useremail: userEmail, balance: 0, totaladded: 0, totalused: 0 }
        return fallback
      }

      const result = data || { useremail: userEmail, balance: 0, totaladded: 0, totalused: 0 }
      setCached(key, result, CREDIT_CACHE_TTL)
      return result
    } catch (error) {
      console.error('Error fetching user credit:', error)
      return { useremail: userEmail, balance: 0, totaladded: 0, totalused: 0 }
    }
  },

  /** ล้าง cache ยอดเครดิต (เรียกหลังเติม/หัก/อนุมัติ) */
  invalidateCreditCache() {
    invalidateByPrefix(CREDIT_CACHE_PREFIX)
  },

  // Create credit transaction (top-up request)
  async createCreditTransaction(userEmail, amount, paymentMethod, slipFile) {
    try {
      // Generate transaction ID
      const transactionId = `CREDIT-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`

      // Upload slip if exists
      let slipURL = null
      if (slipFile) {
        // Use imageService to upload slip
        const { imageService } = await import('./imageService')
        slipURL = await imageService.uploadOrderSlip(slipFile, null, userEmail)
      }

      const { data, error } = await supabase
        .from('credit_transactions')
        .insert({
          transactionid: transactionId,
          useremail: userEmail,
          amount: amount,
          paymentmethod: paymentMethod || 'transfer',
          slipurl: slipURL,
          status: 'pending',
          note: null,
          adminemail: null,
          approvedat: null,
          createdat: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data
    } catch (error) {
      throw new Error(error.message || 'Could not create credit transaction')
    }
  },

  // Get user credit transactions
  async getUserCreditTransactions(userEmail) {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('useremail', userEmail)
        .order('createdat', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return data || []
    } catch (error) {
      throw new Error(error.message || 'Could not fetch credit transactions')
    }
  },

  // Get all pending credit transactions (admin)
  async getPendingCreditTransactions() {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('status', 'pending')
        .order('createdat', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return data || []
    } catch (error) {
      throw new Error(error.message || 'Could not fetch pending transactions')
    }
  },

  // Get all credit transactions (admin)
  async getAllCreditTransactions() {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .order('createdat', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return data || []
    } catch (error) {
      throw new Error(error.message || 'Could not fetch all transactions')
    }
  },

  // Approve credit transaction (admin)
  async approveCreditTransaction(transactionId, adminEmail, note = null) {
    try {
      // Get transaction first
      const { data: transaction, error: fetchError } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('transactionid', transactionId)
        .maybeSingle()

      if (fetchError || !transaction) {
        throw new Error('Transaction not found')
      }

      if (transaction.status !== 'pending') {
        throw new Error('Transaction is not pending')
      }

      // Update transaction status
      const { data, error } = await supabase
        .from('credit_transactions')
        .update({
          status: 'approved',
          adminemail: adminEmail,
          approvedat: new Date().toISOString(),
          note: note
        })
        .eq('transactionid', transactionId)
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      // Update user_credits - Get current balance first
      const { data: currentCredit } = await supabase
        .from('user_credits')
        .select('*')
        .eq('useremail', transaction.useremail)
        .maybeSingle()

      const currentBalance = currentCredit?.balance || 0
      const currentTotalAdded = currentCredit?.totaladded || 0
      const newBalance = currentBalance + transaction.amount
      const newTotalAdded = currentTotalAdded + transaction.amount

      const { error: creditError } = await supabase
        .from('user_credits')
        .upsert({
          useremail: transaction.useremail,
          balance: newBalance,
          totaladded: newTotalAdded,
          totalused: currentCredit?.totalused || 0,
          updatedat: new Date().toISOString()
        }, {
          onConflict: 'useremail'
        })

      if (creditError) {
        console.error('Error updating user credits:', creditError)
        // Don't throw - transaction is already approved
      } else {
        this.invalidateCreditCache()
        window.dispatchEvent(new CustomEvent('creditUpdated', { 
          detail: { userEmail: transaction.useremail, newBalance } 
        }))
      }

      return data
    } catch (error) {
      throw new Error(error.message || 'Could not approve transaction')
    }
  },

  // Reject credit transaction (admin)
  async rejectCreditTransaction(transactionId, adminEmail, note = null) {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .update({
          status: 'rejected',
          adminemail: adminEmail,
          note: note
        })
        .eq('transactionid', transactionId)
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data
    } catch (error) {
      throw new Error(error.message || 'Could not reject transaction')
    }
  },

  // Get credit usage log (PostgreSQL เก็บคอลัมน์เป็นตัวเล็กถ้าไม่ใส่ double quote)
  async getCreditUsageLog(userEmail) {
    try {
      const { data, error } = await supabase
        .from('credit_usage_log')
        .select('*')
        .eq('useremail', userEmail)
        .order('createdat', { ascending: false })

      if (error) throw new Error(error.message)
      return data || []
    } catch (error) {
      throw new Error(error.message || 'Could not fetch credit usage log')
    }
  },

  // Get credit usage log by order ID (for admin to check if order used credit)
  async getCreditUsageLogByOrderId(orderId) {
    try {
      const { data, error } = await supabase
        .from('credit_usage_log')
        .select('*')
        .eq('orderid', orderId)
        .order('createdat', { ascending: false })

      if (error) throw new Error(error.message)
      return data || []
    } catch (error) {
      throw new Error(error.message || 'Could not fetch credit usage log by order ID')
    }
  },

  // Deduct credit (หักเครดิต)
  async deductCredit(userEmail, amount, orderId, note = null) {
    try {
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0')
      }

      // Get current credit
      const currentCredit = await this.getUserCredit(userEmail)
      const currentBalance = currentCredit.balance || 0

      if (currentBalance < amount) {
        throw new Error(`เครดิตไม่พอ (มี ${currentBalance.toLocaleString()} บาท, ต้องการ ${amount.toLocaleString()} บาท)`)
      }

      const newBalance = currentBalance - amount
      const newTotalUsed = (currentCredit.totalused || 0) + amount

      // Update user_credits
      const { error: creditError } = await supabase
        .from('user_credits')
        .upsert({
          useremail: userEmail,
          balance: newBalance,
          totaladded: currentCredit.totaladded || 0,
          totalused: newTotalUsed,
          updatedat: new Date().toISOString()
        }, {
          onConflict: 'useremail'
        })

      if (creditError) {
        throw new Error(creditError.message)
      }

      // Log credit usage (บันทึกประวัติการใช้เครดิต) - ใช้ชื่อคอลัมน์ตัวเล็กให้ตรงกับ PostgreSQL
      try {
        const { error: logError } = await supabase
          .from('credit_usage_log')
          .insert({
            useremail: userEmail,
            orderid: orderId,
            amount: amount,
            createdat: new Date().toISOString()
          })
          .select()

        if (logError) {
          console.error('[creditService] Error logging credit usage:', logError)
        }
      } catch (logError) {
        console.error('[creditService] Error logging credit usage:', logError)
        // Don't throw - credit is already deducted, but log the error
        // This ensures the credit deduction still works even if logging fails
      }

      this.invalidateCreditCache()
      window.dispatchEvent(new CustomEvent('creditUpdated', { 
        detail: { userEmail, newBalance } 
      }))

      return { success: true, newBalance, oldBalance: currentBalance }
    } catch (error) {
      throw new Error(error.message || 'Could not deduct credit')
    }
  },

  // Add credit (คืนเครดิต)
  async addCredit(userEmail, amount, orderId, note = null) {
    try {
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0')
      }

      // Get current credit
      const currentCredit = await this.getUserCredit(userEmail)
      const currentBalance = currentCredit.balance || 0
      const newBalance = currentBalance + amount
      const newTotalAdded = (currentCredit.totaladded || 0) + amount

      // Update user_credits
      const { error: creditError } = await supabase
        .from('user_credits')
        .upsert({
          useremail: userEmail,
          balance: newBalance,
          totaladded: newTotalAdded,
          totalused: currentCredit.totalused || 0,
          updatedat: new Date().toISOString()
        }, {
          onConflict: 'useremail'
        })

      if (creditError) {
        throw new Error(creditError.message)
      }

      // Log credit usage (คืนเครดิต = จำนวนติดลบ) - ใช้ชื่อคอลัมน์ตัวเล็ก
      try {
        const { error: logError } = await supabase
          .from('credit_usage_log')
          .insert({
            useremail: userEmail,
            orderid: orderId,
            amount: -amount,
            createdat: new Date().toISOString()
          })
          .select()

        if (logError) {
          console.error('[creditService] Error logging credit refund:', logError)
        }
      } catch (logError) {
        console.error('[creditService] Error logging credit usage:', logError)
        // Don't throw - credit is already added, but log the error
        // This ensures the credit refund still works even if logging fails
      }

      this.invalidateCreditCache()
      window.dispatchEvent(new CustomEvent('creditUpdated', { 
        detail: { userEmail, newBalance } 
      }))

      return { success: true, newBalance, oldBalance: currentBalance }
    } catch (error) {
      throw new Error(error.message || 'Could not add credit')
    }
  },

  // เติมเครดิตให้ผู้ใช้โดยแอดมิน (ไม่ผ่านการยืนยันสลิป) — รองรับ slipFile เพื่อแนบสลิป
  async addCreditByAdmin(targetUserEmail, amount, adminEmail, note = null, slipFile = null) {
    try {
      if (amount <= 0) {
        throw new Error('จำนวนเงินต้องมากกว่า 0')
      }

      let slipUrl = null
      if (slipFile) {
        const { imageService } = await import('./imageService')
        slipUrl = await imageService.uploadOrderSlip(slipFile, 'ADMIN-TOPUP', targetUserEmail)
      }

      const currentCredit = await this.getUserCredit(targetUserEmail)
      const currentBalance = currentCredit.balance || 0
      const newBalance = currentBalance + amount
      const newTotalAdded = (currentCredit.totaladded || 0) + amount

      const { error: creditError } = await supabase
        .from('user_credits')
        .upsert({
          useremail: targetUserEmail,
          balance: newBalance,
          totaladded: newTotalAdded,
          totalused: currentCredit.totalused || 0,
          updatedat: new Date().toISOString()
        }, {
          onConflict: 'useremail'
        })

      if (creditError) {
        throw new Error(creditError.message)
      }

      this.invalidateCreditCache()
      // บันทึกประวัติ (amount ติดลบ = เติมเครดิต), orderid ใช้ระบุว่าเป็นแอดมินเติมให้
      const logPayload = {
        useremail: targetUserEmail,
        orderid: 'ADMIN-TOPUP',
        amount: -amount,
        createdat: new Date().toISOString()
      }
      if (slipUrl) logPayload.slipurl = slipUrl
      const { error: logError } = await supabase
        .from('credit_usage_log')
        .insert(logPayload)

      if (logError) {
        console.error('[creditService] Error logging admin top-up:', logError)
      }

      window.dispatchEvent(new CustomEvent('creditUpdated', {
        detail: { userEmail: targetUserEmail, newBalance }
      }))

      return { success: true, newBalance, oldBalance: currentBalance }
    } catch (error) {
      throw new Error(error.message || 'ไม่สามารถเติมเครดิตได้')
    }
  }
}
