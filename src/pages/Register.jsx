import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { authService, isMobileDevice, isLikelyWebViewOrInAppBrowser } from '../services/authService'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import { APP_LOGO_URL } from '../utils/constants'
import { hashPassword } from '../utils/passwordHash'
import { checkRateLimit, consumeRateLimit, resetRateLimit } from '../utils/rateLimit'
import { validateRegisterInput } from '../utils/validation'

export default function Register({ setUser }) {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    phone: '',
    address: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)

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
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: result.error || 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้',
          confirmButtonText: 'ตกลง'
        })
      }
      // Note: User will be redirected to Google, then back to /auth/callback
      // The Swal will be closed in AuthCallback component
    } catch (error) {
      Swal.close()
      console.error('Google sign-in error:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google',
        confirmButtonText: 'ตกลง'
      })
    }
  }

  const validateForm = () => {
    const result = validateRegisterInput({
      email: formData.email,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      username: formData.username,
      phone: formData.phone,
      address: formData.address
    })
    if (!result.valid) {
      Swal.fire({
        icon: 'error',
        title: 'ข้อมูลไม่ถูกต้อง',
        text: result.errors[0] || 'กรุณาตรวจสอบข้อมูล',
        confirmButtonText: 'ตกลง'
      })
      return false
    }

    // Validate Phone
    const phoneRegex = /^[0-9]{9,10}$/
    if (formData.phone && !phoneRegex.test(formData.phone.replace(/-/g, ''))) {
      Swal.fire({
        icon: 'error',
        title: 'เบอร์โทรศัพท์ไม่ถูกต้อง',
        text: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (9-10 หลัก)',
        confirmButtonText: 'ตกลง'
      })
      return false
    }

    return true
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    const rate = checkRateLimit('register')
    if (!rate.allowed) {
      Swal.fire({
        icon: 'warning',
        title: 'ลองเกินจำนวนที่กำหนด',
        text: `กรุณารอประมาณ ${Math.ceil((rate.resetAt - Date.now()) / 60000)} นาที แล้วลองสมัครใหม่`,
        confirmButtonText: 'ตกลง'
      })
      return
    }
    if (!validateForm()) return
    setLoading(true)
    consumeRateLimit('register')
    Swal.fire({
      title: 'กำลังสมัครสมาชิก...',
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false
    })

    try {
      const email = formData.email.trim().toLowerCase()
      const username = formData.username.trim()
      const phone = formData.phone.trim().replace(/-/g, '')
      const address = formData.address.trim()

      // Check if email already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('Email')
        .eq('Email', email)
        .maybeSingle()

      if (checkError && checkError.code !== 'PGRST116') {
        throw new Error(checkError.message)
      }

      if (existingUser) {
        Swal.close()
        Swal.fire({
          icon: 'error',
          title: 'อีเมลนี้ถูกใช้งานแล้ว',
          text: 'กรุณาใช้อีเมลอื่นหรือเข้าสู่ระบบ',
          confirmButtonText: 'ตกลง'
        })
        setLoading(false)
        return
      }

      // Hash รหัสผ่านก่อนเก็บใน DB
      const passwordHash = await hashPassword(formData.password)

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          Email: email,
          Password: passwordHash,
          Username: username,
          Phone: phone || null,
          Address: address || null,
          RegisteredDate: new Date().toISOString(),
          Role: 'partner', // Default role
          UserType: 'regular', // Default user type (admin will approve franchise)
          BranchId: null,
          TaxName: null,
          TaxID: null,
          TaxAddress: null
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(insertError.message)
      }

      resetRateLimit('register')
      Swal.close()
      Swal.fire({
        icon: 'success',
        title: 'สมัครสมาชิกสำเร็จ!',
        text: 'กรุณาเข้าสู่ระบบเพื่อเริ่มใช้งาน',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#16a34a'
      }).then(() => {
        navigate('/login')
      })
    } catch (error) {
      Swal.close()
      console.error('Registration error:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถสมัครสมาชิกได้ กรุณาลองใหม่อีกครั้ง',
        confirmButtonText: 'ตกลง'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="loading-float mb-4">
            <img src={APP_LOGO_URL} alt="APP RANGSAN" className="w-32 h-32 mx-auto rounded-full bg-white p-px shadow-lg object-cover" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">APP RANGSAN</h1>
          <p className="text-gray-200 text-sm">สมัครสมาชิกเพื่อเริ่มใช้งาน</p>
        </div>

        <form onSubmit={handleRegister} className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <Icon icon="fa-envelope" className="mr-2 text-gray-500" />
              อีเมล <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="กรอกอีเมลของคุณ"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <Icon icon="fa-user" className="mr-2 text-gray-500" />
              ชื่อผู้ใช้ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={e => setFormData({ ...formData, username: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="กรอกชื่อผู้ใช้"
              minLength={3}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <Icon icon="fa-lock" className="mr-2 text-gray-500" />
              รหัสผ่าน <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition pr-12"
                placeholder="กรอกรหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                <Icon icon={showPassword ? 'fa-eye-slash' : 'fa-eye'} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              รหัสผ่านต้องมีตัวอักษรใหญ่, ตัวอักษรเล็ก, และตัวเลข
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <Icon icon="fa-lock" className="mr-2 text-gray-500" />
              ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={formData.confirmPassword}
                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition pr-12"
                placeholder="ยืนยันรหัสผ่าน"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                <Icon icon={showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <Icon icon="fa-phone" className="mr-2 text-gray-500" />
              เบอร์โทรศัพท์
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="กรอกเบอร์โทรศัพท์ (ไม่บังคับ)"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <Icon icon="fa-map-marker-alt" className="mr-2 text-gray-500" />
              ที่อยู่
            </label>
            <textarea
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="กรอกที่อยู่ (ไม่บังคับ)"
              rows={3}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-emerald-700 transition active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Icon icon="fa-spinner" className="animate-spin mr-2" />
                กำลังสมัครสมาชิก...
              </>
            ) : (
              'สมัครสมาชิก'
            )}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">หรือ</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white border-2 border-gray-300 text-gray-700 py-4 rounded-xl font-bold text-lg hover:bg-gray-50 transition active:scale-95 shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            สมัครสมาชิกด้วย Google
          </button>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              มีบัญชีอยู่แล้ว?{' '}
              <Link to="/login" className="text-emerald-600 font-bold hover:underline">
                เข้าสู่ระบบ
              </Link>
            </p>
          </div>
        </form>

        <p className="text-center text-white text-sm mt-6 opacity-75">
          © 2024 APP RANGSAN. All rights reserved.
        </p>
      </div>
    </div>
  )
}
