# คัดลอกโปรเจกต์ไปสร้าง instance ใหม่ (Quick Guide)

ใช้เมื่อคุณ **ก็อปปี้โฟลเดอร์ทั้งก้อน** (หรือ ZIP) เพื่อได้โปรเจกต์แยก — ร้านใหม่, ลูกค้าใหม่, หรือ sandbox — โดยไม่ให้ไปชนกับฐานข้อมูลหรือ deploy เดิม

**คู่มือละเอียด (ลำดับ SQL, RLS, Git, Vercel):** [CLONE_APP.md](./CLONE_APP.md)

---

## เช็กลิสต์สั้น ๆ (ทำตามลำดับ)

| # | ทำ | เหตุผล |
|---|-----|--------|
| 1 | คัดลอกโฟลเดอร์โปรเจกต์ไปตำแหน่งใหม่ (ตั้งชื่อโฟลเดอร์ใหม่ได้) | ได้โค้ดชุดใหม่ |
| 2 | **อย่า** ใช้ `.env.local` จากต้นฉบับ — ลบในโฟลเดอร์ใหม่ แล้วสร้างใหม่จาก `.env.example` | ป้องกันการชี้ไป Supabase / key เดิม |
| 3 | (แนะนำ) **ลบ** `node_modules` และ `dist` ในโฟลเดอร์ใหม่ แล้วรัน `npm install` | ลดปัญหา binary/path คนละเครื่อง |
| 4 | สร้าง **โปรเจกต์ Supabase ใหม่** → รัน SQL ตาม [CLONE_APP.md § ขั้นตอนที่ 3](./CLONE_APP.md#ขั้นตอนที่-3-สร้างโปรเจกต์-supabase-และฐานข้อมูล) | ฐานข้อมูลแยกจากต้นฉบับ |
| 5 | ใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_KEY` ใน `.env.local` ของโปรเจกต์ **ใหม่** | แอปอ่านค่าจาก env เท่านั้น |
| 6 | รัน `npm run dev` → เปิด `http://localhost:3000` (พอร์ตตาม `vite.config.js`) | ยืนยันว่ารันได้ |
| 7 | (ถ้าใช้ Git) ลบ `.git` หรือเปลี่ยน `remote` ไป repo ใหม่ | ไม่ push ทับต้นฉบับโดยไม่ตั้งใจ |
| 8 | (ถ้า Deploy) สร้าง **โปรเจกต์ Vercel/Netlify ใหม่** + ใส่ env ชุดใหม่ + ตั้ง Redirect URL ใน Supabase ใหม่ | หน้า production แยกจากของเดิม |

---

## สิ่งที่ควร / ไม่ควรนำติดมาจากโฟลเดอร์ต้นฉบับ

| รายการ | คำแนะนำ |
|--------|---------|
| **โค้ด** `src/`, `public/`, config (`vite.config.js`, `package.json` ฯลฯ) | ควรคัดลอก |
| **`.env.example`** | ควรคัดลอก (เป็นแม่แบบ) |
| **`.env.local`** | **ห้าม** reuse จากต้นฉบับ — สร้างใหม่ต่อโปรเจกต์ Supabase ใหม่ |
| **`node_modules/`** | ไม่จำเป็นต้อง copy — รัน `npm install` ใหม่เร็วและเสถียรกว่า |
| **`dist/`** | ไม่ต้อง copy — สร้างใหม่ด้วย `npm run build` |
| **`.vercel/`** | ไม่ควร copy (ผูก deploy เดิม) — โปรเจกต์ใหม่ให้ลิงก์ Vercel ใหม่ |
| **`supabase/.temp/`** | เป็น cache ของ CLI — copy ได้แต่ไม่จำเป็น; ถ้ามีปัญหา link ให้รัน `supabase link` ใหม่ |

---

## คำสั่งเริ่มต้นหลังคัดลอกโฟลเดอร์ (Windows PowerShell)

```powershell
cd "D:\path\to\YourNewFolder"
Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
Remove-Item -Force .env.local -ErrorAction SilentlyContinue
Copy-Item .env.example .env.local
# แก้ .env.local ใส่ URL และ anon key จาก Supabase โปรเจกต์ใหม่
npm install
npm run dev
```

---

## หลังติดตั้ง DB แล้ว

- ตั้งผู้ใช้แอดมินแรก (ตาราง `users`) — ดูตัวอย่างใน [CLONE_APP.md](./CLONE_APP.md#สร้างผู้ใช้แอดมินแรก)
- ถ้าใช้ Google Sign-In: ตั้ง **Redirect URLs** ใน Supabase ให้ตรงกับ URL จริง (local + production) — ดู [ENV_SETUP.md](../ENV_SETUP.md)

---

## เอกสารที่เกี่ยวข้อง

| ไฟล์ | ใช้เมื่อ |
|------|----------|
| [PROJECT_VERIFICATION.md](./PROJECT_VERIFICATION.md) | ตรวจว่าโปรเจกต์ build/test ผ่านก่อนส่งมอบ |
| [CLONE_APP.md](./CLONE_APP.md) | ลำดับไฟล์ SQL, migrations, CLI |
| [README.md](../README.md) | คำสั่งพื้นฐาน |
