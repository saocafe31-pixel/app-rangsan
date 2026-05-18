import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { authService } from '../services/authService'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Swal from 'sweetalert2'

export default function AuthCallback({ setUser }) {
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        Swal.fire({
          title: 'กำลังเข้าสู่ระบบ...',
          didOpen: () => Swal.showLoading(),
          allowOutsideClick: false
        })

        // PKCE: ถ้ามี ?code= ใน URL ต้อง exchange ก่อน
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (code) {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('[AuthCallback] Exchange code error:', exchangeError?.message || exchangeError, exchangeError)
            const msg = exchangeError?.message || ''
            const isPkceError = /PKCE|code verifier|verifier not found/i.test(msg)
            const hintRedirect = /redirect|url|invalid_request|redirect_uri/i.test(msg)
              ? ' แจ้งผู้ดูแลตรวจสอบ Redirect URL ใน Supabase (Authentication → URL Configuration)'
              : ''
            const hintPkce = isPkceError
              ? ' แนะนำ: ใช้ Chrome หรือปิด Tracking Prevention สำหรับไซต์นี้ (Edge: Settings → Privacy → Exceptions). แล้วกดเข้าสู่ระบบด้วย Google อีกครั้ง'
              : ''
            Swal.close()
            Swal.fire({
              icon: 'error',
              title: 'เกิดข้อผิดพลาด',
              text: 'ไม่สามารถยืนยันการเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง' + hintRedirect + hintPkce,
              confirmButtonText: 'ตกลง'
            }).then(() => navigate('/login'))
            return
          }
          // ลบ ?code= ออกจาก URL (ป้องกัน refresh ใช้ code ซ้ำ)
          window.history.replaceState({}, '', window.location.pathname)
        }

        // รอให้ Supabase อ่าน session ได้ (implicit flow ใช้ #access_token=... อาจต้องให้ client ประมวลผล hash ก่อน)
        let session = null
        let sessionError = null
        const isImplicit = !code && window.location.hash
        const maxRetries = code ? 2 : (isImplicit ? 10 : 5)
        const retryDelayMs = code ? 400 : 500
        if (isImplicit) await new Promise((r) => setTimeout(r, 300))

        for (let i = 0; i < maxRetries; i++) {
          const result = await supabase.auth.getSession()
          sessionError = result.error
          session = result.data?.session ?? null
          if (session?.user) break
          if (i < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, retryDelayMs))
          }
        }
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          Swal.close()
          Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง',
            confirmButtonText: 'ตกลง'
          }).then(() => {
            navigate('/login')
          })
          return
        }
        
        if (!session?.user) {
          console.warn('No session found after redirect - hash may not have been parsed')
          Swal.close()
          Swal.fire({
            icon: 'warning',
            title: 'ยังไม่ได้ลงชื่อเข้าใช้',
            text: 'กรุณากด "เข้าสู่ระบบด้วย Google" อีกครั้ง แล้วกด "ดำเนินการต่อ" เมื่อหน้าตรวจสอบของ Googleแสดง',
            confirmButtonText: 'ตกลง'
          }).then(() => {
            navigate('/login')
          })
          return
        }

        if (window.location.hash) window.history.replaceState({}, '', window.location.pathname)

        const email = session.user.email
        console.log('Google sign-in successful for:', email)

        // Check if user exists in users table
        const checkResult = await authService.checkUserExists(email)
        
        if (!checkResult.success) {
          throw new Error(checkResult.error || 'ไม่สามารถตรวจสอบข้อมูลผู้ใช้ได้')
        }

        let userData = null

        // If user doesn't exist, create one
        // Note: createUser will handle duplicate key errors gracefully
        if (!checkResult.exists) {
          console.log('Creating new user in users table...')
          const createResult = await authService.createUser({
            email: email,
            username: session.user.user_metadata?.full_name || 
                     session.user.user_metadata?.name || 
                     email.split('@')[0],
            phone: session.user.user_metadata?.phone || null,
            address: null,
            role: 'partner',
            userType: 'regular'
          })

          if (!createResult.success) {
            // If creation failed, try to fetch existing user one more time
            console.log('User creation failed, attempting to fetch existing user...')
            const retryCheck = await authService.checkUserExists(email)
            if (retryCheck.success && retryCheck.exists) {
              userData = retryCheck.user
            } else {
              throw new Error(createResult.error || 'ไม่สามารถสร้างบัญชีผู้ใช้ได้')
            }
          } else {
            userData = createResult.user
          }
        } else {
          // User exists, use existing data
          console.log('User already exists, using existing data')
          userData = checkResult.user
        }

        // Normalize user data
        const userType = userData.UserType || userData.userType || 'regular'
        const normalizedUserType = userType.toLowerCase().trim() === 'franchise' ? 'franchise' : 'regular'

        const user = {
          email: userData.Email || userData.email || email,
          role: userData.Role || userData.role || 'customer',
          customerType: normalizedUserType,
          userType: normalizedUserType,
          username: userData.Username || userData.username || email.split('@')[0],
          phone: userData.Phone || userData.phone || '',
          address: userData.Address || userData.address || '',
          subdistrict: userData.Subdistrict || userData.subdistrict || '',
          district: userData.District || userData.district || '',
          province: userData.Province || userData.province || '',
          postalCode: userData.PostalCode || userData.postalcode || userData.postalCode || '',
          taxName: userData.TaxName || userData.tax_name || userData.taxName || '',
          taxId: userData.TaxID || userData.tax_id || userData.taxId || '',
          taxAddr: userData.TaxAddress || userData.tax_addr || userData.taxAddr || '',
          branchId: userData.BranchId || userData.branchid || userData.Branch || userData.branch || null
        }

        setUser(user)
        localStorage.setItem('partner_user', JSON.stringify(user))
        
        Swal.close()
        Swal.fire({
          icon: 'success',
          title: 'เข้าสู่ระบบสำเร็จ!',
          text: 'ยินดีต้อนรับ',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#16a34a',
          timer: 1500,
          showConfirmButton: true
        })

        // Navigate based on role
        const userRole = user.role || 'customer'
        if (userRole === 'admin') {
          navigate('/admin/dashboard')
        } else {
          navigate('/home')
        }
      } catch (error) {
        console.error('Auth callback error:', error)
        Swal.close()
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง',
          confirmButtonText: 'ตกลง'
        }).then(() => {
          navigate('/login?error=auth_failed')
        })
      }
    }

    handleAuthCallback()
  }, [navigate, setUser])

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg">
      <LoadingSpinner />
    </div>
  )
}
