# แก้ปัญหาเมื่อรันแอป

## ไม่สามารถเชื่อมต่อ Backend / "ไม่สามารถดึงข้อมูลได้" / ERR_NAME_NOT_RESOLVED

เมื่อแอปขึ้นข้อความ "ไม่สามารถดึงข้อมูลสต็อกได้" หรือใน Console มี `TypeError: Failed to fetch` / `net::ERR_NAME_NOT_RESOLVED` แปลว่าแอปเชื่อมต่อ Supabase ไม่ได้

### สาเหตุที่พบบ่อย

1. **ค่าใน `.env.local` ผิดหรือมี typo**
   - `VITE_SUPABASE_URL` ต้องเป็น **Project URL** จาก Supabase เท่านั้น (รูปแบบ `https://xxxxx.supabase.co`)
   - ห้ามมีช่องว่างหน้าหลัง ไม่มีเครื่องหมายคำพูด ไม่ขาดตัวอักษร (เช่น ต้องลงท้าย `.supabase.co`)

2. **แก้ .env.local แล้วแต่ยังใช้ค่าเก่า**
   - Vite อ่าน env ตอนสตาร์ตเท่านั้น → ต้อง **หยุด dev server (Ctrl+C) แล้วรัน `npm run dev` ใหม่** หลังแก้ .env.local

3. **ไฟล์ .env.local อยู่ผิดที่**
   - ต้องอยู่ที่ **root โปรเจกต์** (โฟลเดอร์เดียวกับ `package.json` และ `vite.config.js`)

### วิธีแก้

1. เปิด **Supabase Dashboard** → โปรเจกต์ของคุณ → **Project Settings** (ไอคอนฟันเฟือง) → **API**
2. คัดลอก **Project URL** (ปุ่ม Copy ด้านขวา) ไปวางใน `.env.local`:
   ```env
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIs...
   ```
   - ตรวจว่าไม่มีช่องว่างก่อน/หลัง `=` และไม่มีบรรทัดว่างแปลกๆ
   - ตรวจว่า URL ลงท้ายด้วย `.supabase.co` (ไม่ใช่ .com หรือขาดตัวอักษร)
3. บันทึก `.env.local` แล้ว **หยุด dev server** (Ctrl+C ใน Terminal) จากนั้นรัน `npm run dev` ใหม่
4. รีเฟรชหน้าแอป (F5)

ถ้าทำครบแล้วยังไม่ได้ ให้ดูที่ Console ว่ามี error จาก `supabase.js` หรือไม่ (เช่น รูปแบบ URL ไม่ถูกต้อง) และตรวจอีกครั้งว่าได้คัดลอก URL จาก Dashboard โดยตรง ไม่ได้พิมพ์เอง

---

## PowerShell: "running scripts is disabled on this system"

เมื่อรัน `npm run dev` แล้วขึ้นข้อความประมาณ:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
```

### สาเหตุ
Windows PowerShell ตั้งค่าไม่ให้รันสคริปต์ (.ps1) เพื่อความปลอดภัย จึงรัน `npm.ps1` ไม่ได้

### วิธีแก้ (เลือกอย่างใดอย่างหนึ่ง)

#### วิธีที่ 1: เปลี่ยน Execution Policy (แนะนำ)

เปิด **PowerShell ในฐานะผู้ใช้ปกติ** (ไม่ต้อง Run as Administrator) แล้วรัน:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

เมื่อถามยืนยัน พิมพ์ `Y` แล้ว Enter  
จากนั้นลองรัน `npm run dev` อีกครั้ง

#### วิธีที่ 2: ใช้ npm ผ่านไฟล์ .cmd

ไม่ต้องเปลี่ยนนโยบายของ Windows ให้รันแบบนี้แทน:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

หรือเปิด **Command Prompt (cmd)** แทน PowerShell แล้วรัน:

```cmd
npm run dev
```

#### วิธีที่ 3: ใช้ Terminal แบบอื่นใน Cursor/VS Code

- เปิด Terminal ใหม่ → เลือก **Command Prompt** หรือ **Git Bash** แทน PowerShell  
- หรือที่เมนู Terminal → New Terminal → เปลี่ยน default profile เป็น "Command Prompt"
