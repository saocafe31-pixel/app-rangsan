import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { authService, isMobileDevice, isLikelyWebViewOrInAppBrowser } from '../services/authService'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import { APP_LOGO_URL } from '../utils/constants'
import { verifyPassword } from '../utils/passwordHash'
import { checkRateLimit, consumeRateLimit, resetRateLimit } from '../utils/rateLimit'
import { validateLoginInput } from '../utils/validation'

export default function Login({ setUser }) {
  const navigate = useNavigate()
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const reason = sessionStorage.getItem('logout_reason')
    if (reason === 'role_changed') {
      sessionStorage.removeItem('logout_reason')
      Swal.fire({
        icon: 'info',
        title: 'บัญชีถูกเปลี่ยนประเภท',
        text: 'บัญชีของคุณถูกเปลี่ยนเป็นลูกค้าปกติแล้ว กรุณาเข้าสู่ระบบใหม่',
        confirmButtonText: 'ตกลง'
      })
    }
  }, [])

  const showError = (message) => {
    Swal.fire({
      icon: 'error',
      title: 'แจ้งเตือน',
      text: message,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#dc2626'
    })
  }

  const handleGoogleSignIn = async () => {
    if (isMobileDevice()) {
      const openInBrowser = isLikelyWebViewOrInAppBrowser()
      const result = await Swal.fire({
        icon: openInBrowser ? 'warning' : 'info',
        title: 'ลงชื่อเข้าใช้ด้วย Google (มือถือ)',
        html: openInBrowser
          ? '<p class="text-left">Google ไม่อนุญาตให้ลงชื่อเมื่อเปิดจากแอปแชท (LINE, Facebook เป็นต้น)</p><p class="text-left mt-2">กรุณา<strong>คัดลอกลิงก์</strong>แล้วไปเปิดใน <strong>Chrome</strong> หรือ <strong>Safari</strong> แล้วลงชื่อเข้าใช้อีกครั้ง</p>'
          : '<p class="text-left">ถ้าเคยเจอข้อผิดพลาด 403 ให้เปิดลิงก์นี้ใน Chrome หรือ Safari แล้วลองใหม่</p>',
        showDenyButton: true,
        confirmButtonText: 'ดำเนินการต่อ',
        denyButtonText: 'คัดลอกลิงก์',
        confirmButtonColor: '#16a34a',
        denyButtonColor: '#2563eb'
      })
      if (result.isDenied) {
        const url = window.location.href
        try {
          await navigator.clipboard.writeText(url)
          Swal.fire({ icon: 'success', title: 'คัดลอกแล้ว', text: 'วางลิงก์ใน Chrome หรือ Safari แล้วลงชื่อเข้าใช้', timer: 2500, showConfirmButton: false })
        } catch {
          Swal.fire({ icon: 'info', title: 'เปิดในเบราว์เซอร์', text: `กรุณาเปิดลิงก์นี้ใน Chrome หรือ Safari:\n${url}`, confirmButtonText: 'ตกลง' })
        }
        return
      }
      if (result.isDismissed) return
    }

    try {
      Swal.fire({
        title: 'กำลังเข้าสู่ระบบด้วย Google...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      const result = await authService.signInWithGoogle()
      
      if (!result.success) {
        Swal.close()
        showError(result.error || 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้')
      }
      // Note: User will be redirected to Google, then back to /auth/callback
      // The Swal will be closed in AuthCallback component
    } catch (error) {
      Swal.close()
      console.error('Google sign-in error:', error)
      showError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google')
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    const rate = checkRateLimit('login')
    if (!rate.allowed) {
      Swal.fire({
        icon: 'warning',
        title: 'ลองเข้าสู่ระบบเกินจำนวนที่กำหนด',
        text: `กรุณารอประมาณ ${Math.ceil((rate.resetAt - Date.now()) / 60000)} นาที แล้วลองใหม่`,
        confirmButtonText: 'ตกลง'
      })
      return
    }
    const loginValidation = validateLoginInput({ email: loginForm.email, password: loginForm.password })
    if (!loginValidation.valid) {
      Swal.fire({
        icon: 'error',
        title: 'ข้อมูลไม่ถูกต้อง',
        text: 'กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง',
        confirmButtonText: 'ตกลง'
      })
      return
    }
    consumeRateLimit('login')
    Swal.fire({
      title: 'กำลังเข้าสู่ระบบ...',
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false
    })

    try {
      const email = loginValidation.sanitized.email.trim().toLowerCase()
      const password = loginForm.password
      console.log('Attempting login with:', { email, passwordLength: password.length })
      
      // Test Supabase connection (env ต้องตั้งใน .env.local)
      if (import.meta.env.DEV) console.log('Testing Supabase connection...')
      
      // First, try to get all users to test connection and check RLS
      const { data: testData, error: testError, count } = await supabase
        .from('users')
        .select('Email, Password, Username', { count: 'exact' })
        .limit(5)
      
      console.log('Test query result:', { 
        data: testData, 
        error: testError, 
        count,
        dataLength: testData?.length 
      })
      
      if (testError) {
        console.error('Supabase connection test failed:', testError)
        console.error('Error details:', {
          message: testError.message,
          details: testError.details,
          hint: testError.hint,
          code: testError.code
        })
        Swal.close()
        showError(`เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล: ${testError.message || testError.hint || 'Unknown error'}`)
        return
      }
      
      console.log('Supabase connection OK. Found users:', testData?.length || 0)
      
      // If no data returned, it might be RLS issue
      if (!testData || testData.length === 0) {
        console.warn('⚠️ No users returned from query. This might be due to RLS (Row Level Security) policy.')
        console.warn('Please check RLS policies in Supabase Dashboard > Authentication > Policies')
      }
      
      // Query by email - try multiple approaches
      let userData = null
      let userError = null
      
      // Try PascalCase first (as per Supabase dashboard)
      console.log('Querying user with email:', email)
      const { data: data1, error: error1 } = await supabase
        .from('users')
        .select('*')
        .eq('Email', email)
        .maybeSingle()
      
      console.log('Query with PascalCase Email:', { 
        data: data1, 
        error: error1,
        hasData: !!data1,
        dataKeys: data1 ? Object.keys(data1) : null
      })
      
      if (error1) {
        console.error('Error with PascalCase query:', {
          message: error1.message,
          details: error1.details,
          hint: error1.hint,
          code: error1.code
        })
        
        // Try lowercase as fallback
        const { data: data2, error: error2 } = await supabase
          .from('users')
          .select('*')
          .eq('email', email.toLowerCase())
          .maybeSingle()
        
        console.log('Query with lowercase email:', { 
          data: data2, 
          error: error2,
          hasData: !!data2
        })
        
        if (error2) {
          userError = error2
        } else {
          userData = data2
        }
      } else {
        userData = data1
      }
      
      // If still no data, try to get all users and filter manually (for debugging)
      if (!userData && !userError) {
        console.log('No user found with direct query. Trying to get all users for debugging...')
        const { data: allUsers, error: allError } = await supabase
          .from('users')
          .select('Email, Password, Username')
          .limit(20)
        
        console.log('All users query result:', {
          data: allUsers,
          error: allError,
          count: allUsers?.length
        })
        
        if (allUsers && allUsers.length > 0) {
          console.log('Available emails in database:', allUsers.map(u => u.Email || u.email))
          const foundUser = allUsers.find(u => 
            (u.Email || u.email || '').toLowerCase() === email.toLowerCase()
          )
          if (foundUser) {
            console.log('Found user in all users list:', foundUser)
            // Get full user data
            const { data: fullUser } = await supabase
              .from('users')
              .select('*')
              .eq('Email', foundUser.Email || foundUser.email)
              .maybeSingle()
            userData = fullUser
          }
        }
      }
      
      if (userError) {
        console.error('Error querying user:', userError)
        Swal.close()
        showError(`เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล: ${userError.message}`)
        return
      }
      
      if (!userData) {
        console.error('No user found with email:', email)
        console.log('Tried both Email (PascalCase) and email (lowercase)')
        Swal.close()
        showError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
        return
      }
      
      console.log('User found:', { 
        email: userData.Email || userData.email, 
        hasPassword: !!(userData.Password || userData.password),
        allKeys: Object.keys(userData)
      })
      
      // ตรวจสอบรหัสผ่าน (รองรับทั้ง bcrypt hash และรหัสเก่าแบบ plain)
      const dbPassword = userData.Password || userData.password
      const passwordOk = await verifyPassword(password, dbPassword)
      if (!passwordOk) {
        Swal.close()
        showError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
        return
      }
      resetRateLimit('login')
      
      // Normalize user data
      // Check UserType from Supabase (column name: UserType)
      const userType = userData.UserType || userData.userType || userData.CustomerType || userData.customer_type || userData.customerType || 'regular'
      const normalizedUserType = userType.toLowerCase().trim() === 'franchise' ? 'franchise' : 'regular'
      
      const user = {
        email: userData.Email || userData.email || '',
        role: userData.Role || userData.role || 'customer',
        customerType: normalizedUserType,
        userType: normalizedUserType,
        username: userData.Username || userData.username || '',
        phone: userData.Phone || userData.phone || '',
        address: userData.Address || userData.address || '',
        subdistrict: userData.Subdistrict || userData.subdistrict || '',
        district: userData.District || userData.district || '',
        province: userData.Province || userData.province || '',
        postalCode: userData.PostalCode || userData.postalcode || userData.postalCode || '',
        taxName: userData.TaxName || userData.tax_name || userData.taxName || '',
        taxId: userData.TaxId || userData.tax_id || userData.taxId || '',
        taxAddr: userData.TaxAddr || userData.tax_addr || userData.taxAddr || '',
        branchId: userData.BranchId || userData.branchid || userData.Branch || userData.branch || null
      }

      setUser(user)
      localStorage.setItem('partner_user', JSON.stringify(user))
      
      Swal.close()
      
      // Navigate based on role
      if (user.role === 'admin') {
        navigate('/admin/dashboard')
      } else {
        navigate('/home')
      }
    } catch (error) {
      Swal.close()
      console.error('Login attempt failed:', error)
      showError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ')
    }
  }

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center gradient-bg px-3 py-4 sm:px-4 sm:py-6 pt-safe pb-safe overflow-y-auto">
      <div className="w-full max-w-[320px] sm:max-w-sm min-w-0 flex-shrink-0 my-auto">
        <div className="text-center mb-3 sm:mb-4">
          <div className="loading-float mb-2 sm:mb-3">
            <img src={APP_LOGO_URL} alt="APP RANGSAN" className="w-[90px] h-[90px] sm:w-[102px] sm:h-[102px] mx-auto rounded-full bg-white p-px shadow-lg object-cover" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-0.5 sm:mb-1">APP RANGSAN</h1>
          <p className="text-gray-200 text-xs">เข้าสู่ระบบเพื่อเริ่มใช้งาน</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-2xl p-4 sm:p-5 space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              <Icon icon="fa-envelope" className="mr-1.5 text-gray-500 inline" />
              อีเมล
            </label>
            <input
              type="email"
              required
              value={loginForm.email}
              onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
              className="w-full border border-gray-200 rounded-lg p-2.5 sm:p-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="กรอกอีเมลของคุณ"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              <Icon icon="fa-lock" className="mr-1.5 text-gray-500 inline" />
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full border border-gray-200 rounded-lg p-2.5 sm:p-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition pr-10"
                placeholder="กรอกรหัสผ่านของคุณ"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 touch-manipulation"
              >
                <Icon icon={showPassword ? 'fa-eye-slash' : 'fa-eye'} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 text-white py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base hover:bg-emerald-700 transition active:scale-95 shadow-md touch-manipulation"
          >
            เข้าสู่ระบบ
          </button>

          <div className="relative my-3 sm:my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-gray-500">หรือ</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full bg-white border border-gray-300 text-gray-700 py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base hover:bg-gray-50 transition active:scale-95 shadow-md flex items-center justify-center gap-2 touch-manipulation"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="truncate">เข้าสู่ระบบด้วย Google</span>
          </button>
        </form>

        <div className="text-center mt-3 sm:mt-4">
          <p className="text-white text-xs opacity-75 mb-1">
            ยังไม่มีบัญชี?{' '}
            <Link to="/register" className="text-emerald-300 font-bold hover:underline" tabIndex={0}>
              สมัครสมาชิก
            </Link>
          </p>
          <p className="text-white text-xs opacity-75">
            © 2024 APP RANGSAN
          </p>
        </div>
      </div>
    </div>
  )
}
