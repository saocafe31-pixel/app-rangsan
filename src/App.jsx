import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { supabase } from './utils/supabase'
import { authService } from './services/authService'
import { getMaintenanceSettings } from './services/shopSettingsService'
import LoadingSpinner from './components/common/LoadingSpinner'
import MaintenancePage from './pages/MaintenancePage'

// Lazy load pages for code splitting
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Home = lazy(() => import('./pages/Home'))
const History = lazy(() => import('./pages/History'))
const Profile = lazy(() => import('./pages/Profile'))
const TaxInvoice = lazy(() => import('./pages/TaxInvoice'))
const Checkout = lazy(() => import('./pages/Checkout'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminOrders = lazy(() => import('./pages/AdminOrders'))
// AdminProducts removed - functionality moved to StockManagement
const StockManagement = lazy(() => import('./pages/StockManagement'))
const BundleProductComposer = lazy(() => import('./pages/BundleProductComposer'))
const ProductQrPage = lazy(() => import('./pages/ProductQrPage'))
const StockAlert = lazy(() => import('./pages/StockAlert'))
const StockLogs = lazy(() => import('./pages/StockLogs'))
const PurchaseOrder = lazy(() => import('./pages/PurchaseOrder'))
const TopUp = lazy(() => import('./pages/TopUp'))
const CreditHistory = lazy(() => import('./pages/CreditHistory'))
const AdminCreditApproval = lazy(() => import('./pages/AdminCreditApproval'))
const AdminUserApproval = lazy(() => import('./pages/AdminUserApproval'))
const AdminUserManagement = lazy(() => import('./pages/AdminUserManagement'))
const AdminFranchiseList = lazy(() => import('./pages/AdminFranchiseList'))
const AdminFranchiseStock = lazy(() => import('./pages/AdminFranchiseStock'))
const AdminShippingSettings = lazy(() => import('./pages/AdminShippingSettings'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const AdminSuppliers = lazy(() => import('./pages/AdminSuppliers'))
const AdminCoupons = lazy(() => import('./pages/AdminCoupons'))
const AdminPromotions = lazy(() => import('./pages/AdminPromotions'))
const AdminReports = lazy(() => import('./pages/AdminReports'))
const FranchiseStockManagement = lazy(() => import('./pages/FranchiseStockManagement'))
const FranchiseStockHistory = lazy(() => import('./pages/FranchiseStockHistory'))
const FranchiseStockDashboard = lazy(() => import('./pages/FranchiseStockDashboard'))
const FranchisePurchaseOrder = lazy(() => import('./pages/FranchisePurchaseOrder'))

function MaintenanceGate({ user, maintenance, children }) {
  const location = useLocation()
  const path = location.pathname || ''
  const allowedPaths = ['/login', '/register', '/auth/callback']
  const isAllowed = allowedPaths.some((p) => path.startsWith(p))
  if (maintenance?.enabled && user?.role !== 'admin' && !isAllowed) {
    return <MaintenancePage message={maintenance.message || 'กำลังปรับปรุงระบบ กรุณาลองใหม่ในภายหลัง'} />
  }
  return children
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '' })

  useEffect(() => {
    // Load user from localStorage
    const savedUser = localStorage.getItem('partner_user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch (e) {
        console.error('Error parsing user from localStorage:', e)
      }
    }
    setLoading(false)

    // Listen for auth state changes (for Google Sign-In)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email)
        
        if (event === 'SIGNED_OUT') {
          // User signed out
          setUser(null)
          localStorage.removeItem('partner_user')
        } else if (event === 'SIGNED_IN' && session?.user) {
          // User signed in - this will be handled by AuthCallback
          // But we can update localStorage if needed
          const savedUser = localStorage.getItem('partner_user')
          if (!savedUser) {
            // If no user in localStorage, wait for AuthCallback to handle it
            console.log('User signed in via OAuth, waiting for AuthCallback...')
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    getMaintenanceSettings().then(setMaintenance)
  }, [])

  // ตรวจสอบว่าแอดมินเปลี่ยน UserType (เช่น franchise -> regular) แล้วบังคับ logout
  useEffect(() => {
    if (!user?.email || user?.role === 'admin') return
    let cancelled = false
    authService.getProfileByEmail(user.email).then((res) => {
      if (cancelled) return
      if (!res.success || !res.profile) return
      const dbType = (res.profile.UserType || '').toLowerCase().trim()
      const storedType = (user.userType || user.customerType || '').toLowerCase().trim()
      const dbNormalized = dbType === 'franchise' ? 'franchise' : 'regular'
      const storedNormalized = storedType === 'franchise' ? 'franchise' : 'regular'
      if (dbNormalized !== storedNormalized) {
        localStorage.removeItem('partner_user')
        setUser(null)
        sessionStorage.setItem('logout_reason', 'role_changed')
      }
    })
    return () => { cancelled = true }
  }, [user?.email, user?.userType, user?.customerType, user?.role])

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <BrowserRouter>
      <MaintenanceGate user={user} maintenance={maintenance}>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
          <Route 
            path="/login" 
            element={!user ? <Login setUser={setUser} /> : <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/home'} />} 
          />
          <Route 
            path="/register" 
            element={!user ? <Register setUser={setUser} /> : <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/home'} />} 
          />
          <Route 
            path="/auth/callback" 
            element={<AuthCallback setUser={setUser} />} 
          />
          <Route 
            path="/home" 
            element={user ? <Home user={user} setUser={setUser} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/history" 
            element={user ? <History user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/profile" 
            element={user ? <Profile user={user} setUser={setUser} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/tax-invoice" 
            element={user ? <TaxInvoice user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/checkout" 
            element={user ? <Checkout user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/topup" 
            element={user ? <TopUp user={user} setUser={setUser} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/credit-history" 
            element={user ? (user.role === 'admin' ? <Navigate to="/admin/credit-approval?tab=history" replace /> : <CreditHistory user={user} />) : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/dashboard" 
            element={user?.role === 'admin' ? <AdminDashboard user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/credit-approval" 
            element={user?.role === 'admin' ? <AdminCreditApproval user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/user-approval" 
            element={user?.role === 'admin' ? <AdminUserApproval user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/user-management" 
            element={user?.role === 'admin' ? <AdminUserManagement user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/franchise-list" 
            element={user?.role === 'admin' ? <AdminFranchiseList user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/franchise-stock/:userEmail" 
            element={user?.role === 'admin' ? <AdminFranchiseStock user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/orders" 
            element={user?.role === 'admin' ? <AdminOrders user={user} /> : <Navigate to="/login" />} 
          />
          {/* AdminProducts route removed - functionality moved to StockManagement */}
          <Route 
            path="/admin/stock" 
            element={user?.role === 'admin' ? <StockManagement user={user} /> : <Navigate to="/login" />} 
          />
          <Route
            path="/admin/bundle-composer"
            element={user?.role === 'admin' ? <BundleProductComposer user={user} /> : <Navigate to="/login" />}
          />
          <Route 
            path="/admin/stock/qr-codes" 
            element={user?.role === 'admin' ? <ProductQrPage user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/stock-alert" 
            element={user?.role === 'admin' ? <StockAlert user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/stock-logs" 
            element={user?.role === 'admin' ? <StockLogs user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/purchase-order" 
            element={user?.role === 'admin' ? <PurchaseOrder user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/shipping-settings" 
            element={user?.role === 'admin' ? <AdminShippingSettings user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/settings" 
            element={user?.role === 'admin' ? <AdminSettings user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/suppliers" 
            element={user?.role === 'admin' ? <AdminSuppliers user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/coupons" 
            element={user?.role === 'admin' ? <AdminCoupons user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/promotions" 
            element={user?.role === 'admin' ? <AdminPromotions user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/reports" 
            element={user?.role === 'admin' ? <AdminReports user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/franchise/stock" 
            element={(user?.userType === 'franchise' || user?.customerType === 'franchise') ? <FranchiseStockManagement user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/franchise/stock-history" 
            element={(user?.userType === 'franchise' || user?.customerType === 'franchise') ? <FranchiseStockHistory user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/franchise/stock-dashboard" 
            element={(user?.userType === 'franchise' || user?.customerType === 'franchise') ? <FranchiseStockDashboard user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/franchise/purchase-order" 
            element={(user?.userType === 'franchise' || user?.customerType === 'franchise') ? <FranchisePurchaseOrder user={user} /> : <Navigate to="/login" />} 
          />
          <Route path="/" element={<Navigate to={user ? (user.role === 'admin' ? '/admin/dashboard' : '/home') : '/login'} />} />
          {/* Redirect old /admin/products route to /admin/stock */}
          <Route 
            path="/admin/products" 
            element={<Navigate to="/admin/stock" replace />} 
          />
          </Routes>
        </Suspense>
      </MaintenanceGate>
    </BrowserRouter>
  )
}

export default App
