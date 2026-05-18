# คู่มือนักพัฒนา (Developer Guide)

เอกสารนี้สำหรับ **developer** ที่จะรัน แก้ไข หรือ deploy โปรเจกต์ APP RANGSAN

---

## 1. สิ่งที่ต้องมี

- **Node.js** (แนะนำ v18 ขึ้นไป)
- **npm** หรือ **pnpm**
- บัญชี **Supabase** (ใช้เป็น backend ฐานข้อมูล + Auth ถ้าใช้ Google)

---

## 2. ติดตั้งและรันโปรเจกต์

คู่มือโคลนโปรเจกต์ใหม่ + ฐาน Supabase แยก: **[docs/CLONE_APP.md](./CLONE_APP.md)**

```bash
# โคลน repo (ถ้ามี)
git clone <repo-url>
cd "App RANGSAN"

# ติดตั้ง dependencies
npm install

# สร้างไฟล์ env (คัดลอกจาก .env.example)
# ใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_KEY จาก Supabase Dashboard → Project Settings → API
cp .env.example .env.local
# แก้ไข .env.local ให้ครบ

# รันโหมดพัฒนา
npm run dev
```

แอปจะเปิดที่ `http://localhost:3000` (ค่าเริ่มต้นใน `vite.config.js` — หรือพอร์ตที่ Vite แจ้ง)

**ตัวแปรสภาพแวดล้อมหลัก:**

| ตัวแปร | ความหมาย | ที่มา |
|--------|----------|--------|
| `VITE_SUPABASE_URL` | Project URL | Supabase → Project Settings → API |
| `VITE_SUPABASE_KEY` | anon/public key | เดียวกัน |

รายละเอียดเพิ่ม: **ENV_SETUP.md**, **.env.example**

---

## 3. โครงสร้างโปรเจกต์ (สรุป)

```
App RANGSAN/
├── public/
├── src/
│   ├── components/     # ปุ่ม, ไอคอน, Sidebar, Header, Modal ฯลฯ
│   ├── hooks/         # useProducts, useOrders (cache)
│   ├── pages/         # หน้า Login, Home, Checkout, Admin* ฯลฯ
│   ├── services/      # orderService, productService, authService ฯลฯ
│   ├── utils/         # supabase, validation, passwordHash, rateLimit
│   └── App.jsx
├── docs/              # เอกสาร (SETTINGS_GUIDE, API_REFERENCE, USER_GUIDE ฯลฯ)
├── .env.example
├── DEPLOY.md
├── DEVELOPMENT_ROADMAP.md
└── package.json
```

- **Data:** เรียก Supabase โดยตรงจาก `src/services/` (ไม่มี REST API แยก)
- **Auth:** Custom login (ตาราง `users`) + ตัวเลือก Google OAuth ผ่าน Supabase Auth
- **Routing:** React Router; route แอดมินขึ้นต้นด้วย `/admin/`

---

## 4. สถาปัตยกรรมแบบย่อ

| ชั้น | รายละเอียด |
|------|-------------|
| **UI** | React (Vite), หน้าใน `src/pages/`, component ใน `src/components/` |
| **State** | useState/useEffect ในหน้า; cache ใน hooks (useProducts, useOrders) และในบาง service (shopSettingsService) |
| **Data** | `src/services/*.js` เรียก `supabase.from('table').select/insert/update/...` |
| **Backend** | Supabase (PostgreSQL + Storage + Auth) |

ตารางและ service หลัก: **docs/API_REFERENCE.md**

---

## 5. การทดสอบ

- **Unit / Component:** Vitest + React Testing Library
- คำสั่ง: `npm run test` (watch), `npm run test:run`, `npm run test:coverage`
- ดูรายละเอียด: **TESTING.md**

---

## 6. Deploy

- **Database:** ตั้งค่า Supabase Production, สร้างตาราง/constraints ตามที่แอปใช้ (รวมตาราง `suppliers` ถ้าใช้หน้าจัดการซัพพลาย)
- **Frontend:** Build ด้วย `npm run build` แล้ว deploy โฟลเดอร์ `dist/` ไป Vercel/Netlify ฯลฯ
- **Env บน Host:** ตั้ง `VITE_SUPABASE_URL` และ `VITE_SUPABASE_KEY` ใน Environment Variables

ขั้นตอนละเอียด: **DEPLOY.md** (หัวข้อ 5.2–5.4)

---

## 7. เอกสารที่ควรอ่านต่อ

| เอกสาร | เหมาะกับ |
|--------|----------|
| **docs/API_REFERENCE.md** | โครงสร้างข้อมูล, ตาราง, services |
| **docs/SETTINGS_GUIDE.md** | Key ใน settings (shop, vat, features ฯลฯ) |
| **docs/USER_GUIDE.md** | การใช้งานแอป (ลูกค้า/แฟรนไชส์/แอดมิน) |
| **DEPLOY.md** | Deploy DB + Frontend + Monitoring |
| **ENV_SETUP.md** | ตั้งค่า environment แบบละเอียด |
| **TROUBLESHOOTING.md** | แก้ปัญหาเบื้องต้น |
| **DEVELOPMENT_ROADMAP.md** | แผนพัฒนาต่อ และสถานะฟีเจอร์ |
