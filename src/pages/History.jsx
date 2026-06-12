import { useState, useEffect, useMemo } from 'react'
import { useOrders } from '../hooks/useOrders'
import { creditService } from '../services/creditService'
import { imageService } from '../services/imageService'
import { installmentService } from '../services/installmentService'
import { notificationService } from '../services/notificationService'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Swal from 'sweetalert2'
import { getOrderItemDisplayName } from '../utils/orderBundleLineUtils'

export default function History({ user }) {
  const { orders, loading, refresh } = useOrders(user)
  const [notifications, setNotifications] = useState([])
  const [loadingNotifications, setLoadingNotifications] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAllDates, setShowAllDates] = useState(false)

  const filteredOrders = useMemo(() => {
    if (showAllDates || (!startDate && !endDate)) return orders
    return orders.filter((order) => {
      const raw = order.Timestamp || order.CreatedAt
      if (!raw) return false
      const itemDate = new Date(raw)
      if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        if (itemDate < start) return false
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (itemDate > end) return false
      }
      return true
    })
  }, [orders, startDate, endDate, showAllDates])

  const copyTracking = async (tracking) => {
    try {
      await navigator.clipboard.writeText(tracking)
      // You can add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  useEffect(() => {
    if (user) {
      fetchNotifications()
    }
  }, [user])

  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true)
      const data = await notificationService.getUserNotifications(user.email)
      setNotifications(data || [])
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoadingNotifications(false)
    }
  }

  const handleMarkAsRead = async (notificationId) => {
    try {
      await notificationService.markAsRead(notificationId)
      setNotifications(prev =>
        prev.map(n => (n.ID === notificationId || n.id === notificationId) ? { ...n, Read: true } : n)
      )
      window.dispatchEvent(new CustomEvent('notificationRead'))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead(user.email)
      setNotifications(prev => prev.map(n => ({ ...n, Read: true })))
      window.dispatchEvent(new CustomEvent('notificationRead'))
      Swal.fire({
        icon: 'success',
        title: 'ทำเครื่องหมายว่าอ่านแล้ว',
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error marking all as read:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถทำเครื่องหมายว่าอ่านแล้วได้'
      })
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch (e) {
      return dateStr
    }
  }

  const formatMoney = (value) =>
    `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const getInstallmentStatusText = (status) => {
    switch (status) {
      case 'paid':
        return 'ชำระครบแล้ว'
      case 'partial':
        return 'ชำระบางส่วน'
      case 'overdue':
        return 'เกินกำหนด'
      case 'cancelled':
        return 'ยกเลิกแผน'
      default:
        return 'รอชำระ'
    }
  }

  const getInstallmentStatusClass = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'partial':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'cancelled':
        return 'bg-gray-100 text-gray-700 border-gray-200'
      default:
        return 'bg-amber-100 text-amber-800 border-amber-200'
    }
  }

  const handlePayInstallmentRemaining = async (order) => {
    const plan = order.InstallmentPlan
    const orderId = order.OrderID || order.ID
    const remainingAmount = Number(plan?.remainingAmount || 0)
    if (!plan?.id || remainingAmount <= 0) return

    try {
      const credit = await creditService.getUserCredit(user.email)
      const result = await Swal.fire({
        title: 'ชำระยอดคงเหลือ',
        html: `
          <div class="text-left space-y-3">
            <div class="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
              <div class="flex justify-between"><span>เลขออเดอร์</span><b>${orderId}</b></div>
              <div class="flex justify-between"><span>ยอดคงเหลือ</span><b class="text-amber-700">${formatMoney(remainingAmount)}</b></div>
              <div class="flex justify-between"><span>เครดิตคงเหลือ</span><b class="text-emerald-700">${formatMoney(credit.balance || 0)}</b></div>
            </div>
            <label class="block text-sm font-bold text-gray-700">เลือกวิธีชำระ</label>
            <div class="space-y-2 text-sm">
              <label class="flex items-center gap-2 rounded-lg border p-2 cursor-pointer">
                <input type="radio" name="installment-payment-method" value="transfer" checked />
                <span>โอนเงินและแนบสลิป</span>
              </label>
              <label class="flex items-center gap-2 rounded-lg border p-2 cursor-pointer">
                <input type="radio" name="installment-payment-method" value="credit" ${Number(credit.balance || 0) < remainingAmount ? 'disabled' : ''} />
                <span>หักเครดิต ${Number(credit.balance || 0) < remainingAmount ? '(เครดิตไม่เพียงพอ)' : ''}</span>
              </label>
            </div>
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">สลิปโอนเงิน (ใช้เมื่อเลือกโอน)</label>
              <input id="installment-slip-file" type="file" accept="image/*" class="w-full text-sm border rounded-lg p-2" />
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'ยืนยันชำระ',
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        preConfirm: () => {
          const selected = document.querySelector('input[name="installment-payment-method"]:checked')?.value || 'transfer'
          const file = document.getElementById('installment-slip-file')?.files?.[0] || null
          if (selected === 'transfer' && !file) {
            Swal.showValidationMessage('กรุณาแนบสลิปโอนเงิน')
            return false
          }
          if (selected === 'credit' && Number(credit.balance || 0) < remainingAmount) {
            Swal.showValidationMessage('ยอดเครดิตไม่เพียงพอ')
            return false
          }
          return { method: selected, file }
        }
      })

      if (!result.isConfirmed) return

      Swal.fire({
        title: 'กำลังบันทึกการชำระ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      if (result.value.method === 'credit') {
        await creditService.deductCredit(
          user.email,
          remainingAmount,
          orderId,
          `ชำระยอดคงเหลือแบ่งชำระ ออเดอร์ ${orderId}`
        )
        await installmentService.recordPayment({
          planId: plan.id,
          orderId,
          userEmail: user.email,
          amount: remainingAmount,
          paymentMethod: 'credit',
          note: 'ชำระยอดคงเหลือด้วยเครดิต',
          recordedBy: user.email,
          metadata: { source: 'history_remaining_payment' }
        })
      } else {
        const slipURL = await imageService.uploadOrderSlip(result.value.file, orderId, user.email)
        await installmentService.recordPayment({
          planId: plan.id,
          orderId,
          userEmail: user.email,
          amount: remainingAmount,
          paymentMethod: 'transfer',
          slipURL,
          note: 'ชำระยอดคงเหลือด้วยการโอนเงิน',
          recordedBy: user.email,
          metadata: { source: 'history_remaining_payment' }
        })
      }

      await refresh()
      Swal.fire({
        icon: 'success',
        title: 'บันทึกการชำระเรียบร้อย',
        text: 'ระบบอัปเดตยอดแบ่งชำระของออเดอร์นี้แล้ว',
        timer: 1800,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error paying installment remaining:', error)
      Swal.fire({
        icon: 'error',
        title: 'ชำระไม่สำเร็จ',
        text: error.message || 'ไม่สามารถบันทึกการชำระยอดคงเหลือได้'
      })
    }
  }

  const formatNotificationDate = (dateStr) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diffMs = now - date
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return 'เมื่อสักครู่'
      if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`
      if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`
      if (diffDays < 7) return `${diffDays} วันที่แล้ว`
      
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return dateStr
    }
  }

  const unreadNotifications = notifications.filter(n => !n.Read && !n.read)

  if (loading) {
    return <LoadingSpinner />
  }

  const hasLeftSidebar = user?.role === 'admin' || user?.userType === 'franchise' || user?.customerType === 'franchise'

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        {hasLeftSidebar && <Sidebar user={user} />}
        <div className={`flex-1 ${hasLeftSidebar ? 'ml-0 md:ml-64' : ''} p-6 pt-20`}>
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ประวัติการสั่งซื้อ</h1>
              <button
            onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold transition"
          >
            <Icon icon="fa-sync-alt" className="text-gray-700" />
            <span className="text-gray-700">รีเฟรช</span>
              </button>
            </div>

            {/* กรองช่วงวันที่ (เหมือนหน้าประวัติการใช้เครดิต) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex gap-4 flex-wrap">
                <div className="min-w-[200px]">
                  <label className="block text-sm font-bold text-gray-700 mb-2">วันที่เริ่มต้น</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      setShowAllDates(false)
                    }}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="min-w-[200px]">
                  <label className="block text-sm font-bold text-gray-700 mb-2">วันที่สิ้นสุด</label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => {
                      setEndDate(e.target.value)
                      setShowAllDates(false)
                    }}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <DateRangeFilter
                  layout="buttonsOnly"
                  labelInline
                  start={startDate}
                  end={endDate}
                  onStartChange={(v) => {
                    setStartDate(v)
                    setShowAllDates(false)
                  }}
                  onEndChange={(v) => {
                    setEndDate(v)
                    setShowAllDates(false)
                  }}
                  showAllDates={showAllDates}
                  onShowAllDatesChange={setShowAllDates}
                  extraButtons={
                    (startDate || endDate || showAllDates) && (
                      <button
                        type="button"
                        onClick={() => {
                          setStartDate('')
                          setEndDate('')
                          setShowAllDates(false)
                        }}
                        className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold text-gray-700 transition"
                      >
                        ล้างตัวกรอง
                      </button>
                    )
                  }
                />
              </div>
            </div>

            {/* Notifications Section */}
        {notifications.length > 0 && (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Icon icon="fa-bell" className="text-emerald-600" />
                แจ้งเตือน
                {unreadNotifications.length > 0 && (
                  <span className="bg-red-600 text-white text-xs font-bold rounded-full px-2 py-1">
                    {unreadNotifications.length}
                  </span>
                )}
              </h2>
              {unreadNotifications.length > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.map((notification) => {
                const isRead = notification.Read || notification.read || false
                const notificationId = notification.ID || notification.id
                
                return (
                  <div
                    key={notificationId}
                    className={`p-3 rounded-lg border transition ${
                      !isRead 
                        ? 'bg-blue-50 border-blue-200' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {!isRead && (
                            <span className="w-2 h-2 bg-emerald-600 rounded-full"></span>
                          )}
                          <h3 className={`text-sm font-bold ${!isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                            {notification.Title || notification.title || 'แจ้งเตือน'}
                          </h3>
                        </div>
                        <p className="text-xs text-gray-600 mb-1">
                          {notification.Message || notification.message || ''}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatNotificationDate(notification.CreatedAt || notification.created_at || notification.createdAt)}
                        </p>
                      </div>
                      {!isRead && (
                        <button
                          onClick={() => handleMarkAsRead(notificationId)}
                          className="flex-shrink-0 text-emerald-600 hover:text-emerald-700 text-xs px-2 py-1 rounded hover:bg-emerald-50 transition"
                          title="ทำเครื่องหมายว่าอ่านแล้ว"
                        >
                          <Icon icon="fa-check" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
            <Icon icon="fa-shopping-bag" className="text-5xl mb-4 opacity-50" />
            <p>ยังไม่มีข้อมูลรายการสั่งซื้อ</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
            <Icon icon="fa-shopping-bag" className="text-5xl mb-4 opacity-50" />
            <p>ไม่พบรายการในช่วงวันที่ที่เลือก</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div key={order.ID} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-3 border-b pb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 uppercase">{order.OrderID || order.ID}</h3>
                    <p className="text-xs text-gray-400">{formatDate(order.Timestamp || order.CreatedAt)}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                      order.Status === 'รอตรวจสอบ'
                        ? 'bg-yellow-100 text-yellow-800'
                        : order.Status === 'จัดส่งแล้ว'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {order.Status}
                  </span>
                </div>

                <div className="space-y-1.5 mb-3">
                  {order.Items && order.Items.length > 0 ? (
                    order.Items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-gray-600">
                        <span>{getOrderItemDisplayName(item.name)} x{item.qty}</span>
                        <span className="font-medium text-gray-800 font-bold">
                          ฿{(item.price * item.qty).toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400">ไม่มีรายการสินค้า</p>
                  )}
                </div>

                {order.Status === 'จัดส่งแล้ว' && (order.TrackingNo || order.Tracking) && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Icon icon="fa-truck" className="text-blue-600" />
                      <span className="font-bold text-blue-900">เลขที่พัสดุ:</span>
                      <span
                        className="font-bold text-blue-700 cursor-pointer hover:text-blue-900 hover:underline transition"
                        onClick={() => copyTracking(order.TrackingNo || order.Tracking)}
                        title="คลิกเพื่อคัดลอกเลขที่พัสดุ"
                      >
                        {order.TrackingNo || order.Tracking}
                      </span>
                      <Icon icon="fa-copy" className="text-blue-500 text-xs" />
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-dashed">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">วิธีการชำระเงิน:</span>
                    <span className="font-bold text-gray-800">
                      {order.PaymentMethod === 'credit' ? (
                        <span className="flex items-center gap-1">
                          <Icon icon="fa-wallet" className="text-emerald-600" />
                          <span className="text-emerald-600">เครดิต</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Icon icon="fa-university" className="text-blue-600" />
                          <span className="text-blue-600">โอนเงิน</span>
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">วิธีการรับสินค้า:</span>
                    <span className="font-bold text-gray-800">
                      {order.ShippingMethod === 'pickup' ? (
                        <span className="flex items-center gap-1">
                          <Icon icon="fa-store" className="text-orange-600" />
                          <span className="text-orange-600">รับเอง</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Icon icon="fa-truck" className="text-purple-600" />
                          <span className="text-purple-600">จัดส่ง</span>
                        </span>
                      )}
                    </span>
                  </div>
                  {order.InstallmentPlan && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-emerald-900 flex items-center gap-2">
                            <Icon icon="fa-percent" className="text-emerald-600" />
                            แผนแบ่งชำระ
                          </p>
                          <p className="text-xs text-emerald-800">
                            ครบกำหนด: {order.InstallmentPlan.dueDate ? new Date(order.InstallmentPlan.dueDate).toLocaleDateString('th-TH') : '-'}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full border text-[10px] font-bold ${getInstallmentStatusClass(order.InstallmentPlan.paymentStatus)}`}>
                          {getInstallmentStatusText(order.InstallmentPlan.paymentStatus)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-white rounded-lg border border-emerald-100 p-2">
                          <p className="text-gray-500">ยอดรวม</p>
                          <p className="font-bold text-gray-900">{formatMoney(order.InstallmentPlan.totalAmount)}</p>
                        </div>
                        <div className="bg-white rounded-lg border border-emerald-100 p-2">
                          <p className="text-gray-500">งวดแรก</p>
                          <p className="font-bold text-emerald-700">
                            {order.InstallmentPlan.depositPercent}% / {formatMoney(order.InstallmentPlan.depositAmount)}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg border border-emerald-100 p-2">
                          <p className="text-gray-500">จ่ายแล้ว</p>
                          <p className="font-bold text-emerald-700">{formatMoney(order.InstallmentPlan.paidAmount)}</p>
                        </div>
                        <div className="bg-white rounded-lg border border-emerald-100 p-2">
                          <p className="text-gray-500">ยอดคงเหลือ</p>
                          <p className="font-bold text-amber-700">{formatMoney(order.InstallmentPlan.remainingAmount)}</p>
                        </div>
                      </div>
                      {(order.InstallmentPayments || []).length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-gray-700">ประวัติการชำระ</p>
                          {(order.InstallmentPayments || []).map((payment, idx) => (
                            <div key={payment.id || idx} className="flex items-center justify-between gap-2 bg-white border border-emerald-100 rounded-lg p-2 text-xs">
                              <div>
                                <p className="font-bold text-gray-800">
                                  ครั้งที่ {idx + 1}: {payment.paymentMethod === 'credit' ? 'เครดิต' : 'โอนเงิน'}
                                </p>
                                <p className="text-gray-500">{formatDate(payment.paidAt || payment.createdAt)}</p>
                                {payment.slipURL && (
                                  <a
                                    href={payment.slipURL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-700 underline"
                                  >
                                    เปิดสลิป
                                  </a>
                                )}
                              </div>
                              <span className="font-bold text-emerald-700">{formatMoney(payment.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {Number(order.InstallmentPlan.remainingAmount || 0) > 0 && order.InstallmentPlan.paymentStatus !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handlePayInstallmentRemaining(order)}
                          className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                        >
                          <Icon icon="fa-money-bill-wave" />
                          ชำระยอดคงเหลือ {formatMoney(order.InstallmentPlan.remainingAmount)}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200">
                    <span>ยอดสุทธิ</span>
                    <span className="text-emerald-700 font-bold text-lg">
                      ฿{Number(order.Total || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  )
}
