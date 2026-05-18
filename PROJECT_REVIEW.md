# รายงานตรวจสอบโปรเจค APP RANGSAN

สรุปจากการตรวจสอบโค้ดในแต่ละส่วน เพื่อให้การใช้งานถูกต้องตามฟังก์ชันปัจจุบัน และจุดที่ควรเพิ่มเติม/แก้ไข

---

## 1. สิ่งที่ตรวจสอบและแก้ไขแล้ว

### 1.1 การเขียน/อ่านข้อมูล (Data layer)

| ไฟล์ | สถานะ | รายละเอียด |
|------|--------|------------|
| **productService.js** | ✅ แก้แล้วก่อนหน้านี้ | ไม่ใช้ `.maybeSingle()` กับตาราง products แล้ว ใช้ `.limit(1)` + ใช้แถวแรก เพื่อกัน error "JSON object requested, multiple (or no) rows returned" เมื่อมี ProductID หรือชื่อซ้ำ; มี `isProductIdExists()` ป้องกันรหัสซ้ำ |
| **orderService.js** | ✅ ตรงตามฟังก์ชัน | ดึงออเดอร์จากตาราง `order` (หลายแถวต่อออเดอร์) แล้ว group ตาม OrderID; มี `enrichOrderItemsWithProductId()` ให้ item.id = ProductID สำหรับหน้าแพ็ก; placeOrder ใช้คอลัมน์ตรงกับ DB (OrderID, Itemname, 'Shipping Cost', Weight ฯลฯ) |
| **packingService.js** | ✅ ตรง | ใช้ `order_id`, `box_index`, `weight_kg`, `items` ตรงกับตาราง `order_packing`; getPacking คืน `weight_kg` โดยมี fallback `weight_Kg` |
| **shippingReportExport.js** | ✅ ตรง | ดึง ProductID, Category, Weight จาก products; คอลัมน์น้ำหนัก (P) ใช้ box.weight_kg หรือคำนวณจากน้ำหนักสินค้า; อธิบายสินค้าจาก Category |
| **helpers.js** | ✅ ตรง | normalizeProduct รองรับทั้ง PascalCase (ProductID, ProductName, Unit, Weight ฯลฯ) และ snake_case/camelCase สำหรับ backward compatibility |

### 1.2 จุดที่แก้ในรอบนี้

- **AdminOrders.jsx** (ยกเลิกออเดอร์ + คืนสต็อก): การค้นหาสินค้าจากชื่อด้วย `.eq('ProductName', item.name).maybeSingle()` ถ้ามีชื่อสินค้าซ้ำจะทำให้ PostgREST คืนหลายแถวแล้ว error — **แก้เป็น `.limit(1)` แล้วใช้แถวแรก** แทน `.maybeSingle()` แล้วใช้ `productList?.[0]` / `productCaseList[0]`

---

## 2. โครงสร้างและเส้นทาง (Routes)

- **แอดมิน:** `/admin/dashboard`, `/admin/orders`, `/admin/stock`, `/admin/stock/qr-codes`, `/admin/stock-alert`, `/admin/stock-logs`, `/admin/purchase-order`, `/admin/credit-approval`, `/admin/user-approval`, `/admin/franchise-list`, `/admin/shipping-settings`, `/admin/settings`, `/admin/suppliers`, `/admin/coupons`, `/admin/promotions`, `/admin/reports`
- **แฟรนไชส์:** `/franchise/stock`, `/franchise/stock-history`, `/franchise/stock-dashboard`, `/franchise/purchase-order`
- **Redirect:** `/admin/products` → `/admin/stock` (ใช้ StockManagement แทน AdminProducts แล้ว)

---

## 3. จุดที่ควรตรวจ/แก้เพิ่มเติม (แนะนำ)

### 3.1 ชื่อคอลัมน์ในฐานข้อมูล

- **ตาราง order:** โค้ดใช้ทั้ง `'Shipping Cost'` (มีช่องว่าง) และ `ShippingCost` — ควรยืนยันว่าใน Supabase ใช้ชื่อคอลัมน์ใด (ถ้าเป็น `shipping_cost` แบบ snake_case ต้อง map ใน service).
- **ตาราง products:** โค้ดใช้ `Weight` (ตัวใหญ่); ใน helpers มี fallback `Weight (grams)` และ `น้ำหนัก (กรัม)` — ควรให้ชื่อคอลัมน์ใน DB เป็นแบบเดียวทั้งระบบ (แนะนำ `Weight` หรือ `weight` แล้วใช้ให้สอดคล้อง).

### 3.2 การใช้ `.single()` ใน service อื่น

- **creditService, poService, supplierService, authService.createUser, taxInvoiceService, notificationService** ยังมี `.single()` อยู่ — ถ้า query นั้นอาจได้ 0 หรือมากกว่า 1 แถว (เช่น RLS บล็อก หรือข้อมูลซ้ำ) จะได้ error คล้าย "multiple (or no) rows returned". แนะนำ: ตรวจทีละจุดว่า query คืนกี่แถว แล้วเปลี่ยนเป็น `.limit(1)` + ใช้แถวแรก หรือ `.maybeSingle()` + จัดการ null ตามความเหมาะสม.

### 3.3 ฟอร์มและ Validation

- **StockManagement – เพิ่มสินค้า:** รหัสสินค้า (id) ไม่บังคับกรอก — ถ้าไม่กรอกจะได้ `PROD_${Date.now()}`. productService.addProduct มีตรวจรหัสซ้ำแล้ว; ถ้าต้องการให้ผู้ใช้กรอกรหัสเอง แนะนำให้บังคับกรอกและอาจเช็คซ้ำตอน blur (เรียก `productService.isProductIdExists`) เพื่อ UX ที่ชัดเจน.
- **AuthCallback / Login:** การ normalize user (role, userType, branchId ฯลฯ) ตรงกับที่ Sidebar และ route guard ใช้ (role === 'admin', userType === 'franchise') — ตรวจแล้วสอดคล้องกัน.

### 3.4 ความปลอดภัยและ RLS

- การเข้าถึงข้อมูล (orders, products, users, order_packing ฯลฯ) ขึ้นกับนโยบาย RLS ใน Supabase — ควรตรวจว่าแอดมิน/แฟรนไชส์/partner เข้าถึงได้เฉพาะข้อมูลที่อนุญาต และไม่มี policy ที่บล็อกการอ่านหลัง insert/update จนทำให้ `.select().single()` หลัง insert error.

### 3.5 ประสิทธิภาพ

- **AdminDashboard:** โหลด orders ทั้งหมดแล้ว filter ในฝั่ง client; ถ้าออเดอร์มีจำนวนมาก อาจพิจารณา filter ตาม date range ที่ API/Supabase แทน (เช่นส่ง start/end ไปใน query).
- **orderService.getAllOrders:** ดึง `*` ทั้งตาราง order — ถ้าคอลัมน์เยอะมาก อาจเลือกเฉพาะคอลัมน์ที่ใช้เพื่อลดขนาดข้อมูล.

---

## 4. สรุปฟังก์ชันหลักที่ตรงกับโค้ดปัจจุบัน

| ฟังก์ชัน | หน้า/Service | สถานะ |
|----------|----------------|--------|
| แสดง/กรองออเดอร์, แพ็กสินค้า, ส่งออก CSV | AdminOrders, PackingModal, packingService, shippingReportExport | ใช้งานได้ ตามที่ออกแบบ |
| จัดการสินค้า/สต็อก, ตรวจรหัสซ้ำ | StockManagement, productService (add/update/getProduct, isProductIdExists) | ใช้งานได้ มีป้องกันรหัสซ้ำ |
| QR สินค้า, แสกนกล้อง | ProductQrPage, CameraScanModal, productQr | ใช้งานได้ |
| Dashboard ภาพรวม + Quick Actions | AdminDashboard | อัปเดตแล้ว (สถานะระบบตอนนี้ + ลิงก์ครบ) |
| Login / Google OAuth / AuthCallback | Login, AuthCallback, authService | ใช้งานได้ (รองรับ PKCE และ implicit) |
| เครดิต, แฟรนไชส์, PO, รายงาน, ตั้งค่า | ตาม routes ข้างต้น | โครงสร้างครบ; แนะนำตรวจ RLS และ .single() ตาม 3.2 |

---

## 5. สรุป: สิ่งที่ควรทำต่อ (ลำดับความสำคัญ)

1. **ยืนยันชื่อคอลัมน์ใน Supabase** (order, products) ให้ตรงกับที่โค้ดใช้ โดยเฉพาะ `Shipping Cost` / `ShippingCost` และ `Weight`.
2. **ตรวจและลดความเสี่ยงจาก `.single()`** ใน creditService, poService, authService, notificationService ฯลฯ — เปลี่ยนเป็น `.limit(1)` หรือ `.maybeSingle()` ตามบริบท.
3. ** (ถ้าต้องการ)** บังคับกรอกรหัสสินค้าในฟอร์มเพิ่มสินค้า และ/หรือตรวจรหัสซ้ำตอน blur ใน StockManagement.
4. ** RLS:** ตรวจนโยบายตารางหลัก (order, products, users, order_packing) ให้สอดคล้องกับ role และการอ่านหลัง insert/update.
5. ** (ระยะยาว)** พิจารณา filter ออเดอร์ตามช่วงวันที่ที่ server/DB ใน Dashboard และลดการดึงคอลัมน์ที่ไม่จำเป็นใน getAllOrders.

หากต้องการให้ช่วยแก้ไฟล์ใดเป็นจุดต่อ (เช่น creditService หรือชื่อคอลัมน์ใน order) บอกชื่อไฟล์หรือ flow ได้เลย

---

## 6. การตรวจอัตโนมัติล่าสุด (2026-03-21)

- **`npm run build`:** ผ่าน (มี warning Vite เรื่อง dynamic/static import ของ `shippingReportExport.js` — ไม่ทำให้ build ล้ม)
- **`npm run test:run`:** ผ่าน (9 tests)
- **เอกสาร:** แก้พอร์ต dev ให้สอดคล้องกับ `vite.config.js` (**localhost:3000**) ใน README, CLONE_APP, DEVELOPER_GUIDE, ENV_SETUP

เช็กลิสต์มาตรฐานสำหรับรอบถัดไป: **[docs/PROJECT_VERIFICATION.md](./docs/PROJECT_VERIFICATION.md)**
