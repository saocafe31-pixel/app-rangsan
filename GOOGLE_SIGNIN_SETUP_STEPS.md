# ขั้นตอนการตั้งค่า Google Sign-In

## ✅ สิ่งที่ทำเสร็จแล้ว

1. ✅ สร้าง `src/services/authService.js` - Service สำหรับจัดการ Google Sign-In
2. ✅ สร้าง `src/pages/AuthCallback.jsx` - หน้า callback สำหรับจัดการ redirect จาก Google
3. ✅ อัปเดต `src/pages/Login.jsx` - เพิ่มปุ่ม "เข้าสู่ระบบด้วย Google"
4. ✅ อัปเดต `src/pages/Register.jsx` - เพิ่มปุ่ม "สมัครสมาชิกด้วย Google"
5. ✅ อัปเดต `src/App.jsx` - เพิ่ม route `/auth/callback` และ auth state listener
6. ✅ อัปเดต `src/utils/supabase.js` - เปิดใช้งาน auth session persistence

## 🔧 ขั้นตอนที่ต้องทำต่อ

### 1. ตั้งค่า Google OAuth ใน Supabase Dashboard

1. ไปที่ [Supabase Dashboard](https://app.supabase.com)
2. เลือกโปรเจคของคุณ
3. ไปที่ **Authentication** > **Providers**
4. คลิกที่ **Google**
5. เปิดใช้งาน Google Provider (Toggle ON)
6. ตั้งค่า **Client ID** และ **Client Secret** (ดูขั้นตอนที่ 2)

### 2. สร้าง Google OAuth Credentials

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. สร้างโปรเจคใหม่หรือเลือกโปรเจคที่มีอยู่
3. ไปที่ **APIs & Services** > **Credentials**
4. คลิก **Create Credentials** > **OAuth client ID**
5. ถ้ายังไม่ได้ตั้งค่า OAuth consent screen ให้ตั้งค่าก่อน:
   - ไปที่ **OAuth consent screen**
   - เลือก **External** (สำหรับ testing) หรือ **Internal** (สำหรับ Google Workspace)
   - กรอกข้อมูลที่จำเป็น (App name, User support email, Developer contact)
   - บันทึกและดำเนินการต่อ
6. กลับไปที่ **Credentials** > **Create Credentials** > **OAuth client ID**
7. เลือก **Web application**
8. ตั้งค่า:
   - **Name**: APP RANGSAN
   - **Authorized JavaScript origins**: 
     - `http://localhost:3000` (สำหรับ development)
     - `https://yourdomain.com` (สำหรับ production - เปลี่ยนเมื่อ deploy)
   - **Authorized redirect URIs**:
     - ไปที่ Supabase Dashboard > Authentication > URL Configuration
     - คัดลอก **Redirect URLs** จาก Supabase (รูปแบบ `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`)
     - ใส่ในช่อง **Authorized redirect URIs**
9. คลิก **Create**
10. คัดลอก **Client ID** และ **Client Secret**

### 3. ใส่ Credentials ใน Supabase

1. กลับไปที่ Supabase Dashboard > Authentication > Providers > Google
2. วาง **Client ID** ในช่อง **Client ID (for OAuth)**
3. วาง **Client Secret** ในช่อง **Client Secret (for OAuth)**
4. คลิก **Save**

### 4. ตรวจสอบ Redirect URL

1. ไปที่ Supabase Dashboard > Authentication > URL Configuration
2. ตรวจสอบว่า **Site URL** ถูกต้อง:
   - Development: `http://localhost:3000`
   - Production: `https://yourdomain.com`
3. ตรวจสอบว่า **Redirect URLs** มี:
   - `http://localhost:3000/auth/callback` (สำหรับ development)
   - `https://yourdomain.com/auth/callback` (สำหรับ production)

## 🧪 การทดสอบ

1. เริ่ม development server: `npm run dev`
2. ไปที่หน้า Login หรือ Register
3. คลิกปุ่ม "เข้าสู่ระบบด้วย Google" หรือ "สมัครสมาชิกด้วย Google"
4. ควรจะ redirect ไปที่ Google login page
5. เลือกบัญชี Google และอนุญาต
6. ควรจะ redirect กลับมาที่ `/auth/callback` และเข้าสู่ระบบอัตโนมัติ

## ⚠️ หมายเหตุสำคัญ

1. **Password Field**: ผู้ใช้ที่สมัครด้วย Google จะไม่มี password ในฐานข้อมูล (Password = null)
2. **User Sync**: ระบบจะสร้าง user ใน `users` table อัตโนมัติเมื่อ login ด้วย Google ครั้งแรก
3. **Email Verification**: Google users จะมี email verified อัตโนมัติ
4. **Session Management**: Supabase Auth จะจัดการ session อัตโนมัติ

## 🐛 Troubleshooting

### ปัญหา: "Redirect URI mismatch"
- **แก้ไข**: ตรวจสอบว่า redirect URI ใน Google Cloud Console ตรงกับ Supabase callback URL
- ตรวจสอบว่าใส่ Supabase Redirect URL (จาก Dashboard > Authentication > URL Configuration) ใน Authorized redirect URIs

### ปัญหา: "Invalid client"
- **แก้ไข**: ตรวจสอบว่า Client ID และ Client Secret ถูกต้องใน Supabase Dashboard

### ปัญหา: "User not created in users table"
- **แก้ไข**: ตรวจสอบ RLS policies ใน Supabase - ต้องอนุญาตให้ INSERT ใน users table
- ตรวจสอบ console log ใน browser เพื่อดู error message

### ปัญหา: "CORS error"
- **แก้ไข**: ตรวจสอบว่า authorized origins ใน Google Cloud Console ถูกต้อง
- ตรวจสอบว่า Site URL ใน Supabase ถูกต้อง

## 📝 Checklist

- [ ] ตั้งค่า Google OAuth ใน Supabase Dashboard
- [ ] สร้าง Google OAuth Credentials
- [ ] ใส่ Client ID และ Client Secret ใน Supabase
- [ ] ตั้งค่า Redirect URLs
- [ ] ทดสอบ Google Sign-In ใน development
- [ ] ตั้งค่า production URLs (เมื่อ deploy)
