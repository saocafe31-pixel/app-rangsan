# เช็กลิสต์ตรวจความเรียบร้อยโปรเจกต์ (Project verification)

ใช้ก่อนส่งมอบ ก่อน deploy ใหญ่ หรือหลัง merge ชุดใหญ่ — ไม่ได้แทนการ review โค้ดทุกไฟล์ แต่ช่วยจับปัญหาพื้นฐานเร็ว

---

## 1. คำสั่งอัตโนมัติ (รันในรากโปรเจกต์)

```powershell
cd "path\to\App RANGSAN"
npm install
npm run build
npm run test:run
```

| คำสั่ง | คาดหวัง |
|--------|---------|
| `npm run build` | จบด้วย `built in ...s` ไม่มี error |
| `npm run test:run` | Test files / Tests ผ่านทั้งหมด |

**หมายเหตุ (ทราบไว้):** ตอน build อาจมี warning จาก Vite เรื่อง `shippingReportExport.js` ถูก import ทั้งแบบ dynamic และ static — ไม่ทำให้ build ล้มเหลว

---

## 2. ไฟล์สภาพแวดล้อมและความลับ

| รายการ | ตรวจ |
|--------|------|
| `.env.local` | มีอยู่บนเครื่อง dev เท่านั้น — **ห้าม** commit (มีใน `.gitignore`) |
| `.env.example` | มีตัวแปรที่จำเป็น ค่าว่างหรือ placeholder — ไม่มี key จริง |
| ไม่มี key จริงในเอกสาร `.md` ที่จะ push | ค้นหา `eyJ` หรือ `supabase.co` ใน diff ก่อน commit |

---

## 3. เอกสารและพอร์ต dev

- **พอร์ต Vite:** ค่าเริ่มต้น **3000** ใน `vite.config.js` (`server.port`) — เอกสารหลัก (README, CLONE_APP, ENV_SETUP redirect) ควรอ้างอิงพอร์ตเดียวกัน
- **เริ่มต้นเร็ว:** [README.md](../README.md) · **โคลน/คัดลอก:** [COPY_PROJECT_QUICK_GUIDE.md](./COPY_PROJECT_QUICK_GUIDE.md) · [CLONE_APP.md](./CLONE_APP.md)

---

## 4. บันทึกการตรวจล่าสุด (อัปเดตเมื่อรันใหม่)

| วันที่ | build | test | ผู้รัน / หมายเหตุ |
|--------|-------|------|-------------------|
| 2026-03-21 | ผ่าน | 9 tests ผ่าน | ตรวจในเครื่อง dev (Windows) |

แก้แถวในตารางด้านบนเมื่อคุณรันเช็กรอบใหม่

---

## 5. จุดตรวจเชิงธุรกิจ (manual)

- ล็อกอินแอดมิน / แฟรนไชส์ / ลูกค้า บน Supabase โปรเจกต์ที่ชี้อยู่
- สร้างออเดอร์ทดสอบ 1 รายการ (ถ้าใช้งานจริง)
- ตรวจ RLS ตามนโยบายทีม — ดู [RLS_SECURITY_RECOMMENDATIONS.md](./RLS_SECURITY_RECOMMENDATIONS.md) ถ้ามี
