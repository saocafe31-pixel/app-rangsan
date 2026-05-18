# การทดสอบ (Testing)

โปรเจกต์ใช้ **Vitest** และ **React Testing Library** สำหรับเทสต์อัตโนมัติ

## คำสั่ง

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run test` | เปิดโหมด watch – รันเทสต์เมื่อแก้ไฟล์ |
| `npm run test:run` | รันเทสต์ครั้งเดียว (เหมาะกับ CI) |
| `npm run test:coverage` | รันเทสต์และสร้างรายงาน coverage (โฟลเดอร์ `coverage/`) |

## โครงสร้าง

- **Setup:** `src/test/setup.js` – โหลด matchers ของ `@testing-library/jest-dom` และ cleanup หลังแต่ละเทสต์
- **Config:** ใน `vite.config.js` มีบล็อก `test` (environment: jsdom, include: `src/**/*.{test,spec}.{js,jsx}`)
- **เทสต์:** วางไฟล์เทสต์ข้างไฟล์ที่เทสต์ หรือในโฟลเดอร์เดียวกัน โดยใช้ชื่อ `*.test.js` / `*.test.jsx` หรือ `*.spec.js` / `*.spec.jsx`

## เทสต์ที่มีอยู่

1. **`src/utils/datePresets.test.js`** – เทสต์ `toYmd`, `DATE_PRESETS`, `getPresetRange`
2. **`src/components/common/LoadingSpinner.test.jsx`** – เทสต์การแสดงข้อความและโครงหลักของ LoadingSpinner

## การเขียนเทสต์เพิ่ม

- ฟังก์ชันใน **utils** หรือ **services** (ที่ไม่มี side effect หนัก) – เขียนเทสต์แบบ unit ได้ตรงๆ
- **Component** – ใช้ `render()` และ `screen` จาก `@testing-library/react` แล้ว assert ข้อความ / class / role
- ถ้า component ต้องใช้ **router / Supabase** – ใช้ mock หรือ wrapper (เช่น `MemoryRouter`) ตามความเหมาะสม

## ทดสอบด้วยมือ (Manual)

ฟีเจอร์ที่ยังไม่มีเทสต์อัตโนมัติ (Login, ออเดอร์, เครดิต, PO ฯลฯ) แนะนำให้ทดสอบด้วยมือตามรายการใน `DEVELOPMENT_ROADMAP.md` ส่วน 2.1–2.3
