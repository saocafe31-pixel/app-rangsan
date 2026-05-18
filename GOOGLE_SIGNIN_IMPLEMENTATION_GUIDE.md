# คู่มือการเพิ่ม Google Sign-In (Gmail Login)

## ภาพรวม
คู่มือนี้จะแนะนำวิธีการเพิ่ม Google Sign-In ให้กับระบบ APP RANGSAN โดยใช้ Supabase Auth ซึ่งรองรับ Google OAuth

## ข้อดีของการใช้ Supabase Auth
1. **ปลอดภัย**: จัดการ JWT และ session อัตโนมัติ
2. **ง่าย**: ไม่ต้องจัดการ OAuth flow เอง
3. **รองรับหลาย Provider**: Google, Facebook, GitHub, etc.
4. **Email Verification**: รองรับการยืนยันอีเมลอัตโนมัติ

## ขั้นตอนการตั้งค่า

### 1. ตั้งค่า Google OAuth ใน Supabase Dashboard

1. ไปที่ [Supabase Dashboard](https://app.supabase.com)
2. เลือกโปรเจคของคุณ
3. ไปที่ **Authentication** > **Providers**
4. คลิกที่ **Google**
5. เปิดใช้งาน Google Provider
6. ตั้งค่า:
   - **Client ID (for OAuth)**: ต้องสร้างจาก Google Cloud Console
   - **Client Secret (for OAuth)**: ต้องสร้างจาก Google Cloud Console

### 2. สร้าง Google OAuth Credentials

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. สร้างโปรเจคใหม่หรือเลือกโปรเจคที่มีอยู่
3. ไปที่ **APIs & Services** > **Credentials**
4. คลิก **Create Credentials** > **OAuth client ID**
5. เลือก **Web application**
6. ตั้งค่า:
   - **Name**: APP RANGSAN
   - **Authorized JavaScript origins**: 
     - `http://localhost:3000` (สำหรับ development)
     - `https://yourdomain.com` (สำหรับ production)
   - **Authorized redirect URIs**:
     - ดูจาก Supabase Dashboard > Authentication > URL Configuration (รูปแบบ `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`)
7. คัดลอก **Client ID** และ **Client Secret**
8. ใส่ใน Supabase Dashboard > Authentication > Providers > Google

### 3. ติดตั้ง Supabase Auth Client

```bash
npm install @supabase/supabase-js
```

(ถ้าติดตั้งแล้วก็ไม่ต้องติดตั้งใหม่)

### 4. อัปเดต Supabase Client Configuration

ตรวจสอบว่า `src/utils/supabase.js` มีการตั้งค่า auth:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})
```

### 5. สร้างฟังก์ชัน Google Sign-In

สร้างไฟล์ `src/services/authService.js`:

```javascript
import { supabase } from '../utils/supabase'

export const authService = {
  // Google Sign-In
  async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })
      
      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Google sign-in error:', error)
      return { success: false, error: error.message }
    }
  },

  // Get current session
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    return session
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return { success: true }
  },

  // Get current user
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  }
}
```

### 6. สร้าง Auth Callback Page

สร้างไฟล์ `src/pages/AuthCallback.jsx`:

```javascript
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function AuthCallback({ setUser }) {
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the session from the URL hash
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) throw error
        
        if (session?.user) {
          // Check if user exists in users table
          const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('Email', session.user.email)
            .maybeSingle()

          // If user doesn't exist, create one
          if (!existingUser) {
            const { data: newUser, error: insertError } = await supabase
              .from('users')
              .insert({
                Email: session.user.email,
                Username: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                Password: null, // No password for OAuth users
                Role: 'partner',
                UserType: 'regular',
                RegisteredDate: new Date().toISOString(),
                Phone: session.user.user_metadata?.phone || null,
                Address: null
              })
              .select()
              .single()

            if (insertError) throw insertError

            // Set user state
            const user = {
              email: newUser.Email,
              role: newUser.Role || 'customer',
              userType: newUser.UserType || 'regular',
              username: newUser.Username,
              phone: newUser.Phone || '',
              address: newUser.Address || ''
            }

            setUser(user)
            localStorage.setItem('partner_user', JSON.stringify(user))
          } else {
            // User exists, just set user state
            const user = {
              email: existingUser.Email,
              role: existingUser.Role || 'customer',
              userType: existingUser.UserType || 'regular',
              username: existingUser.Username,
              phone: existingUser.Phone || '',
              address: existingUser.Address || ''
            }

            setUser(user)
            localStorage.setItem('partner_user', JSON.stringify(user))
          }

          // Navigate based on role
          const userRole = existingUser?.Role || 'partner'
          if (userRole === 'admin') {
            navigate('/admin/dashboard')
          } else {
            navigate('/home')
          }
        } else {
          navigate('/login')
        }
      } catch (error) {
        console.error('Auth callback error:', error)
        navigate('/login?error=auth_failed')
      }
    }

    handleAuthCallback()
  }, [navigate, setUser])

  return <LoadingSpinner />
}
```

### 7. อัปเดต Login Page

เพิ่มปุ่ม Google Sign-In ใน `src/pages/Login.jsx`:

```javascript
import { authService } from '../services/authService'

// เพิ่มฟังก์ชันใน component
const handleGoogleSignIn = async () => {
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
  } catch (error) {
    Swal.close()
    console.error('Google sign-in error:', error)
    showError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google')
  }
}

// เพิ่มปุ่มใน JSX (ก่อนปุ่ม "เข้าสู่ระบบ")
<button
  type="button"
  onClick={handleGoogleSignIn}
  className="w-full bg-white border-2 border-gray-300 text-gray-700 py-4 rounded-xl font-bold text-lg hover:bg-gray-50 transition active:scale-95 shadow-lg flex items-center justify-center gap-3"
>
  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
  เข้าสู่ระบบด้วย Google
</button>

<div className="relative my-6">
  <div className="absolute inset-0 flex items-center">
    <div className="w-full border-t border-gray-300"></div>
  </div>
  <div className="relative flex justify-center text-sm">
    <span className="px-2 bg-white text-gray-500">หรือ</span>
  </div>
</div>
```

### 8. อัปเดต Register Page

เพิ่มปุ่ม Google Sign-In ใน `src/pages/Register.jsx` (เหมือนกับ Login page)

### 9. เพิ่ม Route สำหรับ Auth Callback

อัปเดต `src/App.jsx`:

```javascript
import AuthCallback from './pages/AuthCallback'

// เพิ่ม route
<Route path="/auth/callback" element={<AuthCallback setUser={setUser} />} />
```

### 10. อัปเดต App.jsx เพื่อ Listen Auth State Changes

```javascript
import { useEffect } from 'react'
import { supabase } from './utils/supabase'

// ใน App component
useEffect(() => {
  // Listen for auth state changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // User signed in, handle in AuthCallback
      } else if (event === 'SIGNED_OUT') {
        // User signed out
        setUser(null)
        localStorage.removeItem('partner_user')
      }
    }
  )

  return () => {
    subscription.unsubscribe()
  }
}, [])
```

## ทางเลือกอื่น: ใช้ Google Identity Services (gapi)

ถ้าไม่ต้องการใช้ Supabase Auth สามารถใช้ Google Identity Services โดยตรง:

1. เพิ่ม Google Identity Services script ใน `index.html`
2. ใช้ `google.accounts.oauth2` API
3. จัดการ token และ user info เอง

แต่วิธีนี้ซับซ้อนกว่าและต้องจัดการ security เอง

## หมายเหตุสำคัญ

1. **Password Field**: ผู้ใช้ที่สมัครด้วย Google จะไม่มี password ในฐานข้อมูล (Password = null)
2. **User Sync**: ต้อง sync ข้อมูลระหว่าง Supabase Auth users และ users table
3. **Email Verification**: Supabase Auth จะ verify email อัตโนมัติสำหรับ Google users
4. **Session Management**: Supabase Auth จัดการ session อัตโนมัติ

## Testing

1. ทดสอบ Google Sign-In ใน development
2. ตรวจสอบว่า user ถูกสร้างใน users table
3. ตรวจสอบว่า session ทำงานถูกต้อง
4. ทดสอบ sign out

## Troubleshooting

- **Redirect URI mismatch**: ตรวจสอบว่า redirect URI ใน Google Cloud Console ตรงกับ Supabase callback URL
- **CORS errors**: ตรวจสอบว่า authorized origins ถูกต้อง
- **User not created**: ตรวจสอบ RLS policies ใน Supabase
