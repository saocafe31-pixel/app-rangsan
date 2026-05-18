# 🚀 วิธีรันโปรเจค APP RANGSAN

## 📋 ขั้นตอนการรัน Development Server

### 1. เปิด Terminal/PowerShell
- กด `Win + R` แล้วพิมพ์ `powershell` หรือ `cmd`
- หรือเปิด VS Code แล้วกด `` Ctrl + ` `` (backtick)

### 2. ไปที่โฟลเดอร์โปรเจค (PowerShell)
```powershell
cd "$env:USERPROFILE\Desktop\App RANGSAN"
```

### 3. รัน Development Server
```bash
npm run dev
```

### 4. รอให้ Server เริ่มทำงาน
คุณจะเห็นข้อความประมาณนี้:
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

### 5. เปิด Browser
- Browser จะเปิดอัตโนมัติ (เพราะตั้งค่า `open: true`)
- หรือเปิดเองที่: **http://localhost:3000/**

---

## ⚠️ ถ้าเจอปัญหา

### ❌ Error: `Cannot find module`
**แก้ไข:**
```bash
npm install
```

### ❌ Error: `Port 3000 is already in use`
**แก้ไข:**
1. หยุด process ที่ใช้ port 3000
2. หรือเปลี่ยน port ใน `vite.config.js`

### ❌ Error: `Environment variables not found`
**แก้ไข:**
- ตรวจสอบว่ามีไฟล์ `.env.local` ใน root directory
- ตรวจสอบว่าไฟล์มี `VITE_SUPABASE_URL` และ `VITE_SUPABASE_KEY`

---

## 📝 คำสั่งอื่นๆ ที่มีประโยชน์

### Build สำหรับ Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### ติดตั้ง Dependencies ใหม่
```bash
npm install
```

---

## 💡 Tips

- **หยุด Server**: กด `Ctrl + C` ใน terminal
- **Hot Reload**: เมื่อแก้ไขโค้ด หน้าเว็บจะ refresh อัตโนมัติ
- **Console Logs**: ดูที่ Browser DevTools (F12)

---

*อัปเดตล่าสุด: วันที่สร้างเอกสารนี้*
