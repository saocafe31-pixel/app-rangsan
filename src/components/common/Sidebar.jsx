import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Icon from './Icon'

const MOBILE_BREAKPOINT = 768

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT)
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = () => setIsMobile(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isMobile
}
import { productService } from '../../services/productService'
import { orderService } from '../../services/orderService'
import { creditService } from '../../services/creditService'
import { supabase } from '../../utils/supabase'

export default function Sidebar({ user, onMobileOpenChange }) {
  const location = useLocation()
  const isMobile = useIsMobile()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
  const [pendingCreditCount, setPendingCreditCount] = useState(0)
  const [pendingUserApprovalCount, setPendingUserApprovalCount] = useState(0)

  const isActive = (path) => location.pathname === path
  const closeMobile = () => setMobileOpen(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    onMobileOpenChange?.(mobileOpen)
  }, [mobileOpen, onMobileOpenChange])

  // Fetch all counts for admin
  useEffect(() => {
    if (user?.role === 'admin') {
      // Fetch immediately
      fetchAllCounts()
      
      // Refresh every 30 seconds
      const interval = setInterval(() => {
        fetchAllCounts()
      }, 30000)

      // Refresh when tab becomes visible
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchAllCounts()
        }
      }

      // Listen for update events
      const handleUpdate = () => {
        fetchAllCounts()
      }

      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('stockUpdated', handleUpdate)
      window.addEventListener('orderPlaced', handleUpdate)
      window.addEventListener('creditUpdated', handleUpdate)
      window.addEventListener('userApprovalUpdated', handleUpdate)

      return () => {
        clearInterval(interval)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('stockUpdated', handleUpdate)
        window.removeEventListener('orderPlaced', handleUpdate)
        window.removeEventListener('creditUpdated', handleUpdate)
        window.removeEventListener('userApprovalUpdated', handleUpdate)
      }
    } else {
      // Reset counts for non-admin users
      setLowStockCount(0)
      setPendingOrdersCount(0)
      setPendingCreditCount(0)
      setPendingUserApprovalCount(0)
    }
  }, [user])

  const fetchAllCounts = async () => {
    if (user?.role !== 'admin') {
      setLowStockCount(0)
      setPendingOrdersCount(0)
      setPendingCreditCount(0)
      setPendingUserApprovalCount(0)
      return
    }
    
    try {
      // Fetch low stock count
      const stockCount = await productService.getLowStockCount()
      setLowStockCount(stockCount || 0)
      
      // Fetch pending orders count (รอตรวจสอบ)
      try {
        const orders = await orderService.getAllOrders()
        const pendingCount = orders.filter(o => (o.Status || o.status) === 'รอตรวจสอบ').length
        setPendingOrdersCount(pendingCount || 0)
      } catch (error) {
        console.error('[Sidebar] Error fetching pending orders count:', error)
        setPendingOrdersCount(0)
      }
      
      // Fetch pending credit transactions count
      try {
        const pendingCredits = await creditService.getPendingCreditTransactions()
        setPendingCreditCount(pendingCredits?.length || 0)
      } catch (error) {
        console.error('[Sidebar] Error fetching pending credit count:', error)
        setPendingCreditCount(0)
      }
      
      // Fetch pending user approval count
      try {
        const { data, error } = await supabase
          .from('user_approvals')
          .select('id')
          .eq('status', 'pending')
        
        if (!error && data) {
          setPendingUserApprovalCount(data.length || 0)
        } else {
          setPendingUserApprovalCount(0)
        }
      } catch (error) {
        console.error('[Sidebar] Error fetching pending user approval count:', error)
        setPendingUserApprovalCount(0)
      }
    } catch (error) {
      console.error('[Sidebar] Error fetching counts:', error)
    }
  }

  if (user?.role === 'admin') {
    return (
      <>
        {isMobile && mobileOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={closeMobile} aria-hidden="true" />
        )}
        {isMobile && !mobileOpen && (
          <button type="button" onClick={() => setMobileOpen(true)} className="fixed left-4 top-20 z-50 w-10 h-10 flex items-center justify-center rounded-lg bg-gray-800 text-white shadow-lg md:hidden" aria-label="เปิดเมนู">
            <Icon icon="fa-bars" className="text-xl" />
          </button>
        )}
        <aside className={`w-64 bg-gray-800 text-white h-[calc(100vh-4rem)] fixed left-0 top-16 z-50 transition-transform duration-300 ease-out ${isMobile ? (mobileOpen ? 'translate-x-0' : '-translate-x-full') : ''}`}>
          {isMobile && mobileOpen && (
            <button type="button" onClick={closeMobile} className="absolute right-3 top-4 w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white" aria-label="ปิดเมนู">
              <Icon icon="fa-times" className="text-lg" />
            </button>
          )}
          <nav className="py-4 space-y-1 overflow-y-auto max-h-[calc(100vh-4rem)]" onClick={isMobile ? closeMobile : undefined}>
          <Link
            to="/admin/dashboard"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/dashboard') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-chart-line" />
            <span>Dashboard</span>
          </Link>
          <Link
            to="/admin/orders"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg relative ${
              isActive('/admin/orders') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-shopping-bag" />
            <span className="flex-1">จัดการออเดอร์</span>
            {pendingOrdersCount > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold rounded-full min-w-[22px] h-6 flex items-center justify-center px-1.5 ml-2 shrink-0 z-10 shadow-lg">
                {pendingOrdersCount > 99 ? '99+' : pendingOrdersCount}
              </span>
            )}
          </Link>
          <Link
            to="/admin/stock"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/stock') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-warehouse" />
            <span>จัดการสต็อก</span>
          </Link>
          <Link
            to="/admin/bundle-composer"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/bundle-composer') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-cubes" />
            <span>จัดชุดสินค้า</span>
          </Link>
          <Link
            to="/admin/stock-alert"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg relative ${
              isActive('/admin/stock-alert') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-exclamation-triangle" />
            <span className="flex-1">แจ้งเตือนสต็อกต่ำ</span>
            {lowStockCount > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold rounded-full min-w-[22px] h-6 flex items-center justify-center px-1.5 ml-2 shrink-0 z-10 shadow-lg">
                {lowStockCount > 99 ? '99+' : lowStockCount}
              </span>
            )}
          </Link>
          <Link
            to="/admin/stock-logs"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/stock-logs') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-history" />
            <span>ประวัติเข้าออกสต็อก</span>
          </Link>
          <Link
            to="/admin/purchase-order"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/purchase-order') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-shopping-cart" />
            <span>สั่งซื้อสินค้า (PO)</span>
          </Link>
          <Link
            to="/admin/credit-approval"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg relative ${
              isActive('/admin/credit-approval') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-wallet" />
            <span className="flex-1">อนุมัติเครดิต</span>
            {pendingCreditCount > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold rounded-full min-w-[22px] h-6 flex items-center justify-center px-1.5 ml-2 shrink-0 z-10 shadow-lg">
                {pendingCreditCount > 99 ? '99+' : pendingCreditCount}
              </span>
            )}
          </Link>
          <Link
            to="/admin/user-approval"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg relative ${
              isActive('/admin/user-approval') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-user-check" />
            <span className="flex-1">อนุมัติ UserType</span>
            {pendingUserApprovalCount > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold rounded-full min-w-[22px] h-6 flex items-center justify-center px-1.5 ml-2 shrink-0 z-10 shadow-lg">
                {pendingUserApprovalCount > 99 ? '99+' : pendingUserApprovalCount}
              </span>
            )}
          </Link>
          <Link
            to="/admin/user-management"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/user-management') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-user-cog" />
            <span>จัดการผู้ใช้งาน</span>
          </Link>
          <Link
            to="/admin/franchise-list"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/franchise-list') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-store" />
            <span>รายชื่อแฟรนไชส์</span>
          </Link>
          <Link
            to="/admin/shipping-settings"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/shipping-settings') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-truck" />
            <span>ตั้งค่าการจัดส่ง</span>
          </Link>
          <Link
            to="/admin/settings"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/settings') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-cog" />
            <span>ตั้งค่าทั่วไป</span>
          </Link>
          <Link
            to="/admin/suppliers"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/admin/suppliers') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-truck-loading" />
            <span>จัดการซัพพลายเออร์</span>
          </Link>
        <Link
          to="/admin/coupons"
          className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
            isActive('/admin/coupons') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Icon icon="fa-ticket-alt" />
          <span>จัดการคูปอง</span>
        </Link>
        <Link
          to="/admin/promotions"
          className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
            isActive('/admin/promotions') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Icon icon="fa-gift" />
          <span>จัดการโปรโมชั่น</span>
        </Link>
        <Link
          to="/admin/reports"
          className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
            isActive('/admin/reports') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Icon icon="fa-file-alt" />
          <span>รายงาน</span>
        </Link>
          </nav>
        </aside>
      </>
    )
  }

  // Franchise user sidebar
  if (user?.userType === 'franchise' || user?.customerType === 'franchise') {
    return (
      <>
        {isMobile && mobileOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={closeMobile} aria-hidden="true" />
        )}
        {isMobile && !mobileOpen && (
          <button type="button" onClick={() => setMobileOpen(true)} className="fixed left-4 top-20 z-50 w-10 h-10 flex items-center justify-center rounded-lg bg-gray-800 text-white shadow-lg md:hidden" aria-label="เปิดเมนู">
            <Icon icon="fa-bars" className="text-xl" />
          </button>
        )}
        <aside className={`w-64 bg-gray-800 text-white h-[calc(100vh-4rem)] fixed left-0 top-16 z-50 transition-transform duration-300 ease-out ${isMobile ? (mobileOpen ? 'translate-x-0' : '-translate-x-full') : ''}`}>
          {isMobile && mobileOpen && (
            <button type="button" onClick={closeMobile} className="absolute right-3 top-4 w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white" aria-label="ปิดเมนู">
              <Icon icon="fa-times" className="text-lg" />
            </button>
          )}
          <nav className="py-4 space-y-1 overflow-y-auto max-h-[calc(100vh-4rem)]" onClick={isMobile ? closeMobile : undefined}>
          <Link
            to="/home"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/home') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-home" />
            <span>หน้าแรก</span>
          </Link>
          <Link
            to="/franchise/stock"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/franchise/stock') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-warehouse" />
            <span>จัดการสต็อก</span>
          </Link>
          <Link
            to="/franchise/stock-history"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/franchise/stock-history') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-history" />
            <span>ประวัติสต็อก</span>
          </Link>
          <Link
            to="/franchise/stock-dashboard"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/franchise/stock-dashboard') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-chart-line" />
            <span>แดชบอร์ดสต็อก</span>
          </Link>
          <Link
            to="/franchise/purchase-order"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/franchise/purchase-order') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-shopping-cart" />
            <span>สั่งซื้อสินค้า (PO)</span>
          </Link>
          <Link
            to="/history"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/history') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-shopping-bag" />
            <span>ประวัติออเดอร์</span>
          </Link>
          <Link
            to="/tax-invoice"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/tax-invoice') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-file-invoice" />
            <span>ใบกำกับภาษี</span>
          </Link>
          <Link
            to="/credit-history"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/credit-history') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-history" />
            <span>ประวัติการใช้เครดิต</span>
          </Link>
          <Link
            to="/profile"
            className={`sidebar-item flex items-center gap-3 pl-4 pr-2 py-3 rounded-r-lg ${
              isActive('/profile') ? 'sidebar-active' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon icon="fa-user" />
            <span>โปรไฟล์</span>
          </Link>
          </nav>
        </aside>
      </>
    )
  }

  return (
    <nav className="bg-white border-t border-gray-200 fixed bottom-0 left-0 right-0 z-40 overflow-x-auto">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-around min-w-max">
          <Link
            to="/home"
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition ${
              isActive('/home') ? 'text-emerald-600' : 'text-gray-600'
            }`}
          >
            <Icon icon="fa-home" className="text-xl" />
            <span className="text-xs font-medium">หน้าแรก</span>
          </Link>
          <Link
            to="/history"
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition ${
              isActive('/history') ? 'text-emerald-600' : 'text-gray-600'
            }`}
          >
            <Icon icon="fa-history" className="text-xl" />
            <span className="text-xs font-medium">ประวัติ</span>
          </Link>
          <Link
            to="/tax-invoice"
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition ${
              isActive('/tax-invoice') ? 'text-emerald-600' : 'text-gray-600'
            }`}
          >
            <Icon icon="fa-file-invoice" className="text-xl" />
            <span className="text-xs font-medium">ใบกำกับภาษี</span>
          </Link>
          <Link
            to="/profile"
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition ${
              isActive('/profile') ? 'text-emerald-600' : 'text-gray-600'
            }`}
          >
            <Icon icon="fa-user" className="text-xl" />
            <span className="text-xs font-medium">โปรไฟล์</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
