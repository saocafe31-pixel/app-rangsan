# API Reference (Data Layer)

เอกสารนี้สรุป **ชั้นข้อมูล** ของแอป: ตาราง Supabase ที่ใช้ และ Service ฝั่ง frontend ที่เรียกใช้ (ไม่มี REST API แยก — แอปเรียก Supabase โดยตรงผ่าน `@supabase/supabase-js`)

---

## 1. สรุปการเชื่อมต่อ

| รายการ | รายละเอียด |
|--------|------------|
| Backend | **Supabase** (PostgreSQL + Auth) |
| Client | `src/utils/supabase.js` — สร้าง client จาก `VITE_SUPABASE_URL` และ `VITE_SUPABASE_KEY` |
| Auth | Custom login (ตาราง `users`) + ตัวเลือก Google OAuth ผ่าน Supabase Auth |

---

## 2. ตารางหลัก (Supabase)

| ตาราง | ความหมาย | ใช้โดย |
|-------|----------|--------|
| `users` | ผู้ใช้ (อีเมล, รหัสผ่าน hash, role, userType, ฯลฯ) | authService, Login, Register, Profile, Admin* |
| `order` | รายการออเดอร์ (ทีละแถวต่อรายการ สร้างกลุ่มด้วย OrderID) | orderService, Checkout, AdminOrders, History |
| `products` | สินค้า (ชื่อ, ราคา, สต็อก, MinStock, ฯลฯ) | productService, Home, AdminProducts, StockManagement, PO |
| `settings` | Key-value ตั้งค่า (shop, vat, maintenance, features, notifications, shipping, welcome_message, footer_text) | shopSettingsService, AdminSettings, Checkout, AdminShippingSettings |
| `shipping_rates` | อัตราค่าขนส่ง (น้ำหนัก/ระยะ) | AdminShippingSettings, Checkout |
| `coupons` | คูปองส่วนลด | AdminCoupons, Checkout, orderService |
| `promotions` | โปรโมชั่น (เช่น ซื้อ X แถม Y) | AdminPromotions, Checkout |
| `user_credits` | ยอดเครดิตของผู้ใช้ (user_email, balance) | creditService, Checkout, TopUp, AdminCreditApproval |
| `credit_transactions` | รายการเติม/หัก/อนุมัติเครดิต | creditService, AdminCreditApproval, CreditHistory |
| `credit_usage_log` | บันทึกการใช้เครดิตจ่ายออเดอร์ | creditService, Checkout, CreditHistory |
| `suppliers` | ซัพพลายเออร์ (ชื่อ, ติดต่อ, โทร) | supplierService, AdminSuppliers, PurchaseOrder, StockManagement |
| `purchase_orders` | ใบสั่งซื้อ (PO) | poService, PurchaseOrder, Admin* |
| `po_items` | รายการใน PO | poService |
| `stock_logs` | บันทึกเข้า/ออกสต็อก | productService, StockLogs, AdminReports, poService |
| `tax_invoices` | ใบกำกับภาษี | taxInvoiceService, TaxInvoice, AdminOrders |
| `notifications` | การแจ้งเตือน (อีเมล, อ่านแล้วหรือยัง) | notificationService, Header, AdminUserApproval |
| `user_approvals` | คำขออนุมัติ UserType (แฟรนไชส์ ฯลฯ) | AdminUserApproval, Profile, AdminFranchiseList |
| `franchise_stock` | สต็อกแฟรนไชส์ (รายร้าน) | franchiseStockService, AdminFranchiseStock, แฟรนไชส์ |
| `franchise_stock_logs` | บันทึกเข้า/ออกสต็อกแฟรนไชส์ | franchiseStockService |

---

## 3. Services (ชั้นเรียกข้อมูล)

บริการหลักอยู่ใน `src/services/` — ใช้ `supabase.from('table').select/insert/update/upsert/delete` โดยตรง

| Service | ไฟล์ | หน้าที่หลัก |
|---------|------|-------------|
| **authService** | `authService.js` | signInWithGoogle, getSession, login (users), register (users), getProfile |
| **orderService** | `orderService.js` | getUserOrders, getAllOrders, createOrder, updateOrderStatus, อัปเดตสต็อก/คูปอง/โปรโมชั่น |
| **productService** | `productService.js` | getProducts, getProductById, updateStock, getLowStockCount, stock_logs |
| **shopSettingsService** | `shopSettingsService.js` | getShopInfo, getVatRate, getMaintenanceSettings, getFeaturesSettings, getNotificationsSettings, getUiTexts (cache ได้) |
| **creditService** | `creditService.js` | getUserCredit, topUp, useCredit, approveCredit, getPendingCreditTransactions, getCreditHistory |
| **supplierService** | `supplierService.js` | getSuppliersFromTable, createSupplier, updateSupplier, deleteSupplier, getSuppliersForDropdown |
| **poService** | `poService.js` | สร้าง/อัปเดต PO, po_items, รายงาน, receive PO → อัปเดต products + stock_logs |
| **taxInvoiceService** | `taxInvoiceService.js` | สร้าง/อัปเดต/ดึงใบกำกับภาษี (tax_invoices) |
| **notificationService** | `notificationService.js` | สร้าง/อ่านการแจ้งเตือน, getUnreadCount |
| **franchiseStockService** | `franchiseStockService.js` | สต็อกแฟรนไชส์, โอนเข้า/ออก, franchise_stock_logs, ผูกกับ order |
| **printService** | `printService.js` | พิมพ์ใบเสร็จ/ใบกำกับ/ใบปะหน้า (ใช้ getShopInfo, getVatRate; ไม่เขียน DB โดยตรง) |
| **imageService** | `imageService.js` | อัปโหลดรูป (slip, signature ฯลฯ) ไป Storage |

---

## 4. รูปแบบการเรียก (ตัวอย่าง)

- **ดึงข้อมูล:** `supabase.from('table').select('*').eq('col', value).order('col', { ascending: false })`
- **เพิ่ม:** `supabase.from('table').insert({ ... })`
- **อัปเดต:** `supabase.from('table').update({ ... }).eq('id', id)`
- **upsert ตาม key:** `supabase.from('settings').upsert({ key, value, updatedat }, { onConflict: 'key' })`

รายละเอียดคอลัมน์และ constraint ดูได้จาก SQL ในโปรเจกต์ หรือ Supabase Dashboard → Table Editor.

---

## 5. เอกสารที่เกี่ยวข้อง

- **ตั้งค่า (settings keys):** `docs/SETTINGS_GUIDE.md`
- **Deploy / DB:** `DEPLOY.md`
- **ความปลอดภัย / RLS:** `docs/RLS_*.md`, `docs/SECURITY_IMPROVEMENTS_PLAN.md`
