# แผนการพัฒนาต่อ (Development Roadmap)

**อัปเดตล่าสุด:** ตรวจสอบเทียบกับโค้ดเบสปัจจุบัน

---

## สรุปสถานะปัจจุบัน

### สิ่งที่ทำเสร็จแล้ว (100%)
- ฟีเจอร์หลักทั้งหมดทำงานได้แล้ว
- ระบบความปลอดภัยตั้งค่าเสร็จแล้ว (RLS, constraints)
- Database Constraints ถูกสร้างแล้ว
- RLS ถูกปิดสำหรับทุกตารางที่เกี่ยวข้อง (custom authentication)

### สิ่งที่ทำเสร็จเพิ่ม (จากการตรวจสอบ)
- **1.1 จัดระเบียบไฟล์** – ลบไฟล์ซ้ำซ้อน, มี `FILE_ORGANIZATION_PLAN.md`
- **5.1 Environment Setup** – มี `ENV_SETUP.md` และการตั้งค่า `.env.local` / `.env.example`
- **6.1 ระบบ Coupons** – มีหน้า `AdminCoupons`, route `/admin/coupons`, จัดการตาราง `coupons` (สร้าง/ใช้/จัดการ)
- **6.2 ระบบ Shipping Rates** – มีหน้า `AdminShippingSettings`, route `/admin/shipping-settings`, ใช้ตาราง `shipping_rates` และ `settings` (key: shipping)
- **4.2 UX ส่วนใหญ่** – ใช้ `LoadingSpinner`, SweetAlert2 (success/error/confirm) ทั่วโปรเจกต์
- **4.3 Responsive** – ปรับ layout มือถือแล้ว (Dashboard/Orders filter, ฟิลเตอร์ "ทั้งหมด", แสดงวันที่ตามรูปแบบค้นหา)
- **7. Documentation บางส่วน** – มี `ENV_SETUP.md`, `TROUBLESHOOTING.md`, `GOOGLE_SIGNIN_*.md`, `FILE_ORGANIZATION_PLAN.md`, `IMPLEMENTATION_GUIDE.md` ฯลฯ
- **2.0 เทสต์อัตโนมัติ** – ตั้งค่า Vitest + React Testing Library แล้ว มีเทสต์ `datePresets` และ `LoadingSpinner` (ดู `TESTING.md`)
- **3.1–3.3 ความปลอดภัย** – Password Hashing (bcryptjs), Rate Limiting (client), Validation + sanitize (ดู `src/utils/passwordHash.js`, `rateLimit.js`, `validation.js`)
- **5.2–5.4 Deploy/Monitoring** – มี `DEPLOY.md` (ขั้นตอน DB, Frontend, Sentry), ErrorBoundary + `reportError` ในโค้ด (พร้อมต่อเมื่อใส่ Sentry)

---

## สิ่งที่ยังเหลือ / ควรทำต่อไป

## 1. การทำความสะอาดและจัดระเบียบ

### 1.1 จัดระเบียบไฟล์
- ✅ ลบไฟล์ SQL และ MD ที่ซ้ำซ้อน/ไม่ได้ใช้ (ทำเสร็จแล้ว)
- ✅ สร้าง `FILE_ORGANIZATION_PLAN.md` (ทำเสร็จแล้ว)

### 1.2 จัดระเบียบโค้ด
- ⚠️ **Review และ refactor code ที่ซ้ำซ้อน**
- ⚠️ **เพิ่ม comments ในโค้ดที่ซับซ้อน**
- ⚠️ **จัดระเบียบ imports และ exports**

---

## 2. การทดสอบระบบ (แนะนำ)

### 2.0 เทสต์อัตโนมัติ (มีแล้ว)
- ✅ **Vitest + React Testing Library** – ตั้งค่าแล้ว (ดู `TESTING.md`)
- ✅ เทสต์ `src/utils/datePresets.js` (toYmd, DATE_PRESETS, getPresetRange)
- ✅ เทสต์ `src/components/common/LoadingSpinner.jsx`
- ⚠️ แนะนำเพิ่มเทสต์ให้ utils / services / components อื่นที่สำคัญ

**คำสั่ง:** `npm run test` (watch) / `npm run test:run` (รันครั้งเดียว) / `npm run test:coverage` (ดู coverage)

### 2.1 ทดสอบฟีเจอร์หลัก (มือ)
- ⚠️ ทดสอบการ Login/Register
- ⚠️ ทดสอบการจัดการสินค้า
- ⚠️ ทดสอบการสั่งซื้อสินค้า
- ⚠️ ทดสอบระบบเครดิต
- ⚠️ ทดสอบระบบ PO
- ⚠️ ทดสอบระบบสต็อกแฟรนไชส์
- ⚠️ ทดสอบการพิมพ์ใบเสร็จและใบกำกับภาษี

### 2.2 ทดสอบความปลอดภัย
- ⚠️ ทดสอบการตรวจสอบสิทธิ์ (Authorization)
- ⚠️ ทดสอบการตรวจสอบข้อมูล (Validation)
- ⚠️ ทดสอบการทำงานของ Database Constraints

### 2.3 ทดสอบ Performance
- ⚠️ ทดสอบความเร็วในการโหลดข้อมูล
- ⚠️ ทดสอบ Pagination / Search / Filter

---

## 3. การปรับปรุงความปลอดภัย (สำคัญ)

### 3.1 Password Security
- ✅ **Password Hashing** (ทำแล้ว)
  - ใช้ `bcryptjs` ใน `src/utils/passwordHash.js` – hash ก่อนเก็บใน DB, ตรวจด้วย `verifyPassword` ตอน login
  - รองรับรหัสผ่านเก่าที่เก็บแบบ plain (เปรียบเทียบได้จน user เปลี่ยนรหัส)

### 3.2 Rate Limiting
- ✅ **Client-side Rate Limiting** (ทำแล้ว)
  - จำกัด Login และ Register: ไม่เกิน 5 ครั้งต่อ 2 นาที ต่อเบราว์เซอร์ (`src/utils/rateLimit.js`)
  - หมายเหตุ: การจำกัดที่ server/Edge Function จะแข็งแกร่งกว่า

### 3.3 Input Validation
- ✅ **Validation + Sanitize ฝั่ง client** (ทำแล้ว)
  - `src/utils/validation.js` – ตรวจอีเมล, ความแข็งแรงรหัสผ่าน, ความยาว, sanitize string
  - ใช้ใน Register และ Login ก่อนส่ง Supabase
  - หมายเหตุ: การตรวจที่ server (Edge Function / API) จะช่วยป้องกันได้แน่นอนกว่า

---

## 4. การปรับปรุง UX/UI (Optional)

### 4.1 Performance Optimization
- ✅ **Caching** (ทำแล้ว) – ดู `CACHING.md`
  - Products & Orders: cache ใน `useProducts` / `useOrders` (TTL 5 นาที), ล้างด้วย `invalidateByPrefix('products_')` / `('orders_')` หลังสั่งออเดอร์
  - ยอดเครดิต: cache ใน `creditService.getUserCredit` (TTL 1 นาที), ล้างเมื่อเติม/หัก/อนุมัติ
  - `invalidateByPrefix(prefix)` ใช้ล้างเฉพาะกลุ่ม key

### 4.2 User Experience
- ✅ Loading indicators มีแล้ว (`LoadingSpinner`)
- ✅ Success/Error messages และ Confirmation dialogs มีแล้ว (SweetAlert2)
- ⚠️ ตรวจสอบว่า Error messages ชัดเจนเพียงพอในทุกจุด

### 4.3 Responsive Design
- ✅ ปรับปรุง Mobile Experience แล้ว (filter, ปุ่ม, วันที่)
- ⚠️ ทดสอบบนอุปกรณ์จริงหลายขนาด

---

## 5. การ Deploy Production (เมื่อพร้อม)

### 5.1 Environment Setup
- ✅ มีเอกสารและตัวอย่างการตั้งค่า env (`ENV_SETUP.md`, `.env.example`)

### 5.2 Database Setup
- ⚠️ ตั้งค่า Supabase Production (สร้าง DB, RLS, constraints, import ข้อมูล) – **ขั้นตอนละเอียดใน `DEPLOY.md`**

### 5.3 Frontend Deployment
- ⚠️ Deploy (Vercel/Netlify ฯลฯ), Custom Domain, SSL – **ขั้นตอนใน `DEPLOY.md` และ `ENV_SETUP.md` หัวข้อ 7**

### 5.4 Monitoring & Logging
- ✅ **ในโค้ด:** มี `ErrorBoundary` (จับ React error แสดง fallback) และ `reportError()` ใน `src/utils/errorReport.js` (พร้อมต่อเมื่อใส่ Sentry)
- ⚠️ ตั้งค่า Error Tracking (Sentry ฯลฯ) – **ขั้นตอนใน `DEPLOY.md` หัวข้อ 5.4**

---

## 6. การพัฒนาฟีเจอร์เพิ่มเติม (Optional)

### 6.1 ระบบ Coupons
- ✅ ระบบสร้าง/ใช้/จัดการ Coupons (Admin) – มีแล้ว

### 6.2 ระบบ Shipping Rates
- ✅ ระบบจัดการ Shipping Rates และ settings (pickup/delivery) – มีแล้ว

### 6.3 ระบบ Settings
- ✅ มีการใช้ตาราง `settings` ใน Shipping แล้ว
- ⚠️ หน้า “จัดการ Settings ทั่วไป” แยก (ถ้าต้องการ) – ยังไม่มี

### 6.4 ระบบ Suppliers Management
- มี `supplierService` และใช้ใน PurchaseOrder, StockManagement
- ⚠️ **หน้า Admin จัดการ Suppliers โดยตรง** (CRUD suppliers) – ยังไม่มี (จัดการผ่าน PO/Stock อยู่)

---

## 7. การทำ Documentation (แนะนำ)

### มีแล้ว
- ENV_SETUP, TROUBLESHOOTING, GOOGLE_SIGNIN_*, FILE_ORGANIZATION_PLAN, IMPLEMENTATION_GUIDE ฯลฯ
- ✅ **API Reference** – `docs/API_REFERENCE.md` (ตาราง Supabase, Services, Data layer)
- ✅ **User Guide** – `docs/USER_GUIDE.md` (คู่มือลูกค้า/แฟรนไชส์/แอดมิน + FAQ)
- ✅ **Developer Guide** – `docs/DEVELOPER_GUIDE.md` (setup, โครงสร้าง, รัน, deploy, ลิงก์เอกสารอื่น)
- ✅ **ดัชนีเอกสาร** – `docs/README.md` (ชุด API/User/Developer + เอกสารอื่นใน docs)

---

## สรุปลำดับความสำคัญ

### สูง (ควรทำก่อน)
1. ✅ ทำความสะอาดและจัดระเบียบไฟล์ (ทำเสร็จแล้ว)
2. ✅ Password Hashing + Rate Limiting + Validation (ทำแล้ว)
3. ⚠️ ทดสอบระบบด้วยมือ (หรือเพิ่มเทสต์อัตโนมัติ)

### ปานกลาง (ควรทำ)
4. ⚠️ Rate Limiting และ Server-side Validation
5. ⚠️ Deploy Production + Monitoring

### ต่ำ (Optional)
6. ⚠️ จัดระเบียบโค้ด (refactor, comments, imports)
7. ⚠️ Caching, Documentation เพิ่มเติม
8. ⚠️ หน้า Admin จัดการ Suppliers / Settings ทั่วไป (ถ้าต้องการ)

---

## สรุปท้ายไฟล์

**สถานะโปรเจกต์:** ฟีเจอร์หลักและ UX/UI พื้นฐานพร้อมใช้งานแล้ว

**สิ่งที่ยังเหลือและควรทำก่อนขึ้น Production:**
1. ⚠️ **Password Hashing** (Register/Login)
2. ✅ เทสต์อัตโนมัติ (Vitest + เทสต์ตัวอย่างแล้ว – ดู TESTING.md) + ⚠️ ทดสอบด้วยมือตาม 2.1–2.3
3. ⚠️ Deploy + ตั้งค่า Production และ Monitoring

**ฟีเจอร์เสริมที่ทำแล้ว:** Coupons, Shipping Rates, Settings (shipping), ฟิลเตอร์ “ทั้งหมด” และการแสดงวันที่ตามรูปแบบค้นหา, ปรับ layout มือถือ
