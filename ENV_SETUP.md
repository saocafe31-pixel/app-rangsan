# การตั้งค่า .env.local (ไม่ commit)

## 1. สร้างไฟล์ .env.local

ไฟล์ `.env.local` ถูกสร้างจาก `.env.example` แล้ว (หรือรันคำสั่งด้านล่างเอง):

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

## 2. ใส่ค่าจาก Supabase Dashboard

1. เปิด [Supabase Dashboard](https://supabase.com/dashboard) → เลือกโปรเจกต์
2. ไปที่ **Project Settings** (ไอคอนฟันเฟือง) → **API**
3. คัดลอกค่าลงใน `.env.local`:
   - **Project URL** → ใส่ใน `VITE_SUPABASE_URL=`
   - **anon / public key** → ใส่ใน `VITE_SUPABASE_KEY=`

ตัวอย่างรูปแบบ (ห้ามใช้ค่าจริงจากที่นี่ใน Git):

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

4. บันทึกไฟล์ แล้วรัน `npm run dev` ใหม่

## 3. ตรวจว่าไม่ commit key จริง

ก่อน `git add` หรือ `git commit` ตรวจสอบเสมอ:

```powershell
git status
```

- **ต้องไม่เห็น** `.env.local` ในรายการ "Changes to be committed" หรือ "Untracked files"
- ถ้าเห็น `.env.local` แสดงว่า Git กำลังติดตามไฟล์นี้ → **อย่า add/commit** และตรวจสอบว่า `.gitignore` มี `.env.local` อยู่

ตรวจว่า .env.local ถูก ignore:

```powershell
git check-ignore -v .env.local
```

ควรแสดงผลประมาณ: `.gitignore:29:.env.local    .env.local` (หมายเลขบรรทัดอาจต่างกัน)

## 4. ถ้าเคย push key จริงไปแล้ว (ในประวัติ Git)

1. **เปลี่ยน (rotate) anon key ใน Supabase**
   - Supabase Dashboard → Project Settings → API
   - หา "anon public" key → คลิก **Regenerate** หรือ **Rotate**
   - คัดลอก key ใหม่ไปใส่ใน `.env.local` ในเครื่องคุณเท่านั้น

2. **อย่า push key ใหม่ลง Git**
   - ใช้ key ใหม่เฉพาะใน `.env.local` (local และในเครื่องที่ deploy)
   - ใน Supabase ยังมี service_role key — ห้ามใส่ใน frontend หรือใน repo

3. พิจารณาลบค่าลับออกจากประวัติ Git (advanced) ถ้าต้องการ เช่น ใช้ `git filter-repo` หรือคำแนะนำจาก [GitHub - Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## 5. Redirect URL หลังลงชื่อด้วย Google (แก้หน้าไม่เด้งกลับหลังยืนยัน)

ถ้า deploy แล้วใช้ **ลงชื่อเข้าใช้ด้วย Google** แต่หลังยืนยันแล้วเบราว์เซอร์ไปเปิด **localhost** หรือไม่กลับมาเข้าสู่ระบบ แสดงว่า Supabase ยังใช้ redirect เป็น localhost อยู่ ต้องตั้งค่าใน Supabase ดังนี้:

1. เปิด [Supabase Dashboard](https://supabase.com/dashboard) → เลือกโปรเจกต์
2. ไปที่ **Authentication** → **URL Configuration**
3. ตั้งค่า:
   - **Site URL:** ใส่ URL แอป production เช่น `https://app-rangsan.vercel.app` (ไม่ใช้ `http://localhost:...`)
   - **Redirect URLs:** กด **Add URL** แล้วเพิ่ม:
     - `https://app-rangsan.vercel.app/auth/callback` (ใช้โดเมนจริงของแอปคุณ)
     - ถ้าต้องการรัน local ด้วย ให้เพิ่ม `http://localhost:3000/auth/callback` (หรือพอร์ตที่ใช้รัน dev — ค่าเริ่มต้นใน `vite.config.js` คือ 3000)
4. กด **Save**

หลังบันทึกแล้ว ลองลงชื่อด้วย Google อีกครั้ง หลังยืนยันเบราว์เซอร์จะกลับมาที่แอปและเข้าสู่ระบบได้

## 6. เปลี่ยนชื่อแอปบนหน้าลงชื่อเข้าใช้ Google (เป็น "APP RANGSAN")

ตอนลงชื่อเข้าใช้ด้วย Google ผู้ใช้จะเห็นข้อความแบบ "ลงชื่อเข้าใช้ ไปยัง zvrvtkvhhtdwxmqeeilo.supabase.co" เพราะ Google แสดง domain ของ Supabase ให้เปลี่ยนเป็นชื่อแอปได้โดยตั้งค่าใน **Google Cloud Console**:

1. เปิด [Google Cloud Console](https://console.cloud.google.com/) → เลือกโปรเจกต์ที่ใช้กับ Supabase (โปรเจกต์ที่สร้าง OAuth Client ID สำหรับ Google Sign-In)
2. ไปที่ **APIs & Services** → **OAuth consent screen** (หรือ [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding))
3. กด **Edit app** (แก้ไขแอป)
4. ตั้งค่า:
   - **Application name:** ใส่ `APP RANGSAN` (หรือชื่อที่ต้องการ)
   - **Application logo:** (ไม่บังคับ) อัปโหลดโลโก้แอป
   - **User support email:** เลือกอีเมลสำหรับติดต่อ
   - **Developer contact:** อีเมลสำหรับให้ Google ติดต่อ
5. บันทึก (**Save and Continue**)

**หมายเหตุ:** หลังบันทึก Google อาจต้องใช้เวลา **ยืนยันตัวตน (verification)** สักระยะ (หลายวันทำการ) จึงจะแสดงชื่อแอปแทน domain บนหน้าลงชื่อเข้าใช้ในบางกรณี ถ้ายังเห็น domain อยู่ให้รอการยืนยันหรือตรวจสอบว่าได้กรอกข้อมูลครบใน OAuth consent screen

### ทางเลือก: ใช้ Custom domain ของ Supabase (เห็นโดเมนตัวเองแทน xxx.supabase.co)

ถ้าไม่อยากรอการยืนยันจาก Google หรืออยากให้ผู้ใช้เห็นโดเมนของคุณ (เช่น `auth.rangsan.com`) แทน `xxx.supabase.co` บนหน้าลงชื่อเข้าใช้ Google สามารถใช้ **Custom domain** ของ Supabase ได้

**ข้อควรรู้**
- Custom domain เป็น **add-on ของแผนเสียเงิน** (Pro/Team) — ดู [Supabase Custom Domains](https://supabase.com/docs/guides/platform/custom-domains) และ [Add-ons](https://supabase.com/dashboard/project/_/settings/addons?panel=customDomain)
- ใช้ได้แค่ **subdomain** (เช่น `api.yourdomain.com` หรือ `auth.yourdomain.com`) ไม่ใช้ root domain (`yourdomain.com`)
- หลังตั้งค่าแล้ว **Supabase Auth และ OAuth** จะใช้โดเมนนี้ ผู้ใช้จะเห็นโดเมนนี้บนหน้าลงชื่อเข้าใช้ของ Google

**ขั้นตอนโดยย่อ**

1. **เปิดใช้ Custom domain ใน Supabase**
   - [Supabase Dashboard](https://supabase.com/dashboard) → เลือกโปรเจกต์ → **Project Settings** → **General**
   - หา **Custom Domains** (หรือไปที่ [Add-ons](https://supabase.com/dashboard/project/_/settings/addons?panel=customDomain) เพื่อเปิด add-on ก่อน)
   - ใส่ subdomain ที่ต้องการ เช่น `auth.rangsan.com` (ต้องเป็น subdomain ของโดเมนที่คุณถืออยู่)

2. **ตั้งค่า DNS ที่ผู้ให้บริการโดเมน**
   - สร้าง **CNAME**: ชื่อ `auth` (หรือ subdomain ที่เลือก) ชี้ไปที่ `xxxxxxxx.supabase.co` (ค่าใน Dashboard จะบอก)
   - สร้าง **TXT** สำหรับการยืนยัน: Supabase จะแสดงค่า `_acme-challenge.auth.yourdomain.com` ให้ใส่ใน DNS
   - ใช้ TTL ต่ำ (เช่น 300) ชั่วคราวเพื่อให้แก้ไข/ทดสอบได้เร็ว

3. **ยืนยันและเปิดใช้ใน Supabase**
   - ใน Dashboard กดตรวจสอบ/ยืนยัน (Verify) หลัง DNS แพร่แล้ว
   - เปิดใช้ (Activate) custom domain

4. **ตั้งค่า Google OAuth ให้รองรับโดเมนใหม่**
   - [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials** → เลือก OAuth 2.0 Client ID ที่ใช้กับ Supabase
   - ใน **Authorized redirect URIs** ให้เพิ่ม:
     - `https://auth.yourdomain.com/auth/v1/callback` (ใช้ subdomain จริงที่ตั้งใน Supabase)
   - เก็บ URI เดิม `https://xxxxxxxx.supabase.co/auth/v1/callback` ไว้ด้วยก็ได้

5. **ให้แอปใช้โดเมนใหม่ (ถ้าต้องการ)**
   - หลัง Activate แล้ว ถ้าต้องการให้ทุก request ไป Supabase ผ่านโดเมนนี้ ให้เปลี่ยนใน `.env.local` และ env บน Vercel:
     - `VITE_SUPABASE_URL=https://auth.yourdomain.com`
   - ค่า anon key เหมือนเดิม ไม่ต้องเปลี่ยน

**เอกสารอ้างอิง:** [Supabase – Custom Domains](https://supabase.com/docs/guides/platform/custom-domains)

## 7. Deploy บน Vercel

เมื่อ deploy ไป Vercel ระบบจะไม่อ่านไฟล์ `.env.local` (ไฟล์นี้ไม่ถูก push ขึ้น Git) ดังนั้นต้องตั้งค่า Environment Variables ใน Vercel:

1. เปิด [Vercel Dashboard](https://vercel.com/dashboard) → เลือกโปรเจกต์
2. ไปที่ **Settings** → **Environment Variables**
3. เพิ่มตัวแปรสองตัว (ใช้ค่าจาก Supabase Dashboard → Project Settings → API เหมือนใน `.env.local`):
   - **Name:** `VITE_SUPABASE_URL` → **Value:** Project URL ของ Supabase (เช่น `https://xxxx.supabase.co`)
   - **Name:** `VITE_SUPABASE_KEY` → **Value:** anon / public key
4. เลือก Environment: **Production** (และ **Preview** ถ้าต้องการให้ preview deployments ใช้ค่าเดียวกัน)
5. กด **Save** แล้ว **Redeploy** โปรเจกต์ (Deployments → ... → Redeploy) เพื่อให้ build ใหม่อ่านค่าตัวแปร

ถ้าไม่ตั้งค่านี้ แอปบน Vercel จะแสดง error ว่าไม่พบ `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`

## สรุป

| ไฟล์            | ใส่ key จริงได้ไหม | Commit ได้ไหม |
|-----------------|---------------------|----------------|
| `.env.example`  | ไม่ (เว้นว่าง)      | ได้           |
| `.env.local`    | ได้ (ในเครื่องคุณ)  | **ไม่ได้**    |
