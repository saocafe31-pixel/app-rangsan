import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { getCached, setCached } from '../utils/cache'
import { installmentService } from '../services/installmentService'

export function useOrders(user) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = useCallback(async (forceRefresh = false) => {
    if (!user) return

    try {
      setLoading(true)

      // Check cache
      const cacheKey = `orders_${user.email}`
      if (!forceRefresh) {
        const cached = getCached(cacheKey)
        if (cached) {
          setOrders(cached)
          setLoading(false)
          return
        }
      }

      // Use exact column names from Supabase: UserEmail (not User), Timestamp (not CreatedAt)
      const { data, error } = await supabase
        .from('order')
        .select('*')
        .eq('UserEmail', user.email)
        .order('Timestamp', { ascending: false })

      if (error) {
        console.error('Error fetching orders:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        // Check if it's RLS issue
        if (error.code === 'PGRST301' || error.message?.includes('RLS') || error.message?.includes('policy')) {
          console.warn('⚠️ RLS policy might be blocking access to order table')
          console.warn('Please disable RLS or create policy for "order" table in Supabase Dashboard')
        }
        setLoading(false)
        return
      }

      // Group orders by OrderID (since each item is a separate row)
      const ordersMap = new Map()
      const rawOrders = data || []
      
      rawOrders.forEach(row => {
        const orderId = row.OrderID || row.orderid || row.order_id
        if (!orderId) return

        if (!ordersMap.has(orderId)) {
          ordersMap.set(orderId, {
            ID: orderId,
            OrderID: orderId,
            UserEmail: row.UserEmail || row.useremail,
            Username: row.Username || row.username,
            Total: row.Total || row.total || 0,
            Status: row.Status || row.status || 'รอตรวจสอบ',
            SlipURL: row.SlipURL || row.slipurl,
            Address: row.Address || row.address,
            TrackingNo: row.TrackingNo || row.trackingno || row.Tracking || row.tracking,
            Timestamp: row.Timestamp || row.timestamp || row.CreatedAt || row.created_at,
            Discount: row.Discount || row.discount || 0,
            'Shipping Cost': row['Shipping Cost'] || row.Shipping || row.shipping || 0,
            Weight: row.Weight || row.weight || 0,
            PaymentMethod: row.PaymentMethod || row.paymentmethod || 'transfer',
            ShippingMethod: row.ShippingMethod || row.shippingmethod || 'delivery',
            Items: []
          })
        }

        // Add item to order
        const order = ordersMap.get(orderId)
        order.Items.push({
          name: row.Itemname || row.ItemName || row.itemname || row.item_name,
          qty: row.Qty || row.qty || 0,
          price: row.Price || row.price || 0
        })
      })

      // Convert map to array and sort by timestamp
      const ordersData = Array.from(ordersMap.values()).sort((a, b) => {
        const dateA = new Date(a.Timestamp || 0)
        const dateB = new Date(b.Timestamp || 0)
        return dateB - dateA // Descending order (newest first)
      })

      try {
        const orderIds = ordersData.map((order) => order.ID || order.OrderID).filter(Boolean)
        const planMap = await installmentService.getPlansByOrderIds(orderIds)
        const paymentMap = await installmentService.getPaymentsByPlanIds(
          [...planMap.values()].map((plan) => plan.id)
        )
        ordersData.forEach((order) => {
          const plan = planMap.get(String(order.ID || order.OrderID || '').trim())
          if (!plan) return
          order.InstallmentPlan = plan
          order.PaymentStatus = plan.paymentStatus
          order.PaidAmount = plan.paidAmount
          order.RemainingAmount = plan.remainingAmount
          order.PaymentDueDate = plan.dueDate
          order.DepositPercent = plan.depositPercent
          order.DepositAmount = plan.depositAmount
          order.InstallmentPayments = paymentMap.get(Number(plan.id)) || []
        })
      } catch (installmentError) {
        console.warn('[useOrders] ไม่สามารถ enrich installment plans:', installmentError.message || installmentError)
      }

      setOrders(ordersData)
      setCached(cacheKey, ordersData)
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchOrders()
  }, [user, fetchOrders])

  return {
    orders,
    loading,
    refresh: () => fetchOrders(true)
  }
}
