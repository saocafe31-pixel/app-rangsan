# Progress log (APP RANGSAN)

บันทึกเมื่อ **ปิดรอบงาน** หลังมีการเปลี่ยนแปลงไฟล์ใน repo — รายการล่าสุดอยู่ **ด้านบนสุด** ของหัวข้อ `## รายการ` ด้านล่าง

รายละเอียดนโยบายเดียวกับ **[PROJECT_WORKFLOW_REPORT.md](./PROJECT_WORKFLOW_REPORT.md)** หัวข้อ 6 และกฎ **[.cursor/rules/project-workflow.mdc](../.cursor/rules/project-workflow.mdc)** / **[AGENTS.md](../AGENTS.md)**

---

## แนวทาง (บังคับ)

| หัวข้อ | รายละเอียด |
|--------|------------|
| **เมื่อไหร่** | ทุกครั้งที่จบรอบงานและได้ **แก้ เพิ่ม หรือลบ** ไฟล์ในโปรเจกต์ (รวม `docs/` และ `.cursor/rules/`) |
| **ยกเว้น** | สำรวจอย่างเดียวโดย **ไม่เปลี่ยน** ไฟล์ใน workspace |
| **ตำแหน่ง** | ไฟล์นี้ (`docs/PROGRESS_LOG.md`) เท่านั้น — ห้ามแตกเป็น log หลายไฟล์โดยไม่ปรับดัชนีใน [docs/README.md](./README.md) |
| **ลำดับ** | เพิ่มรายการใหม่ **ทันทีใต้** บรรทัด `<!-- progress-log-entries -->` (ให้อยู่เหนือรายการเก่า) |
| **ก่อนปิดงาน** | ลบไฟล์ชั่วคราว / สคริปต์ทดลอง / สำเนาที่ไม่ตั้งใจ commit — ไม่ให้เหลือใน repo |

### รูปแบบหนึ่งรายการ (copy แล้วแก้)

```markdown
### YYYY-MM-DD — [feat|fix|docs|chore] หัวข้อสั้น
- **สรุป:** 1–3 ประโยค (ทำอะไร / ทำไม)
- **ไฟล์หลัก:** `path/…` หรือสรุปโฟลเดอร์ (เช่น `src/services/`, เอกสาร workflow)
- **ตรวจสอบ:** สิ่งที่รันหรือตรวจจริง (เช่น ลิงก์ markdown, `npm run test`, build)
- **ลบไฟล์ชั่วคราว:** ระบุชื่อไฟล์ที่ลบแล้ว หรือ `-` ถ้าไม่มี
```

---

## รายการ

<!-- progress-log-entries -->

### 2026-06-12 — [fix/UX] จัดรูปแบบ Excel รายงานออเดอร์ละเอียด
- **สรุป:** เพิ่มคอลัมน์ `วันที่สรุปรายวัน` และ `UserEmail` ในชีต `ยอดรวมตามออเดอร์`; เพิ่ม style ให้ทุกชีต เช่น header สีเขียว, border, alternating rows, number format, column width และ freeze header row
- **ไฟล์หลัก:** `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run test:run -- src/utils/orderDetailReportExport.test.js` (6 tests), `npm run build`, `ReadLints`
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** ยังใช้ Excel XML `.xls` เดิมเพื่อไม่เพิ่ม dependency; การแสดง style อาจขึ้นกับโปรแกรมที่เปิดไฟล์

### 2026-06-12 — [fix/UX] Filter หน้าแอดมินไม่ขึ้น full-page loading ระหว่างค้นหา
- **สรุป:** แยกโหลดครั้งแรกกับ refresh หลังเปลี่ยน filter ใน `AdminOrders`, `AdminDashboard`, `AdminReports`; ค้นหา/เปลี่ยนวันที่/เลือก Supplier ยัง realtime แต่แสดง inline “กำลังอัปเดตข้อมูล...” แทน loading screen ทั้งหน้า
- **ไฟล์หลัก:** `src/pages/AdminOrders.jsx`, `src/pages/AdminDashboard.jsx`, `src/pages/AdminReports.jsx`, `docs/PROJECT_PROGRESS_LOG.md`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run build`, `npm run test:run -- src/utils/orderDetailReportExport.test.js` (6 tests), `ReadLints`
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** ครั้งแรกที่เข้าหน้ายังแสดง loading screen ได้ตามเดิม; หลังมีข้อมูลแล้ว filter จะไม่ทำให้หน้ากระพริบกลับไป loading screen

### 2026-06-12 — [fix/feat] ปรับรายงานยอดขายและ Excel export ให้ reconcile ยอดออเดอร์
- **สรุป:** ปรับ `getAllOrders()` ให้โหลด raw rows แบบ paginated ก่อน group; รายงานยอดขายและ Excel ใช้ summary เดียวกันจากสูตร `Qty*Price - ส่วนลด/โปร + ค่าจัดส่ง`; เพิ่ม Supplier filter หลายค่า; เพิ่มชีต `ยอดรวมตามออเดอร์` และ `สรุปงบกำไรขาดทุน` พร้อมผลต่างยอดบันทึกกับสูตร
- **ไฟล์หลัก:** `src/pages/AdminReports.jsx`, `src/services/orderService.js`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run test:run -- src/utils/orderDetailReportExport.test.js` (6 tests), `npm run build`, `ReadLints`
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** ไม่เปลี่ยน schema/ข้อมูลจริงในฐานข้อมูล; Excel ยังเป็น Excel XML `.xls` เพื่อไม่เพิ่ม dependency

### 2026-06-11 — [fix] แก้ export รายงานละเอียด error users.email
- **สรุป:** ปรับ query ตาราง `users` ในปุ่ม Excel รายงานออเดอร์ละเอียดให้เลือกเฉพาะคอลัมน์จริง `Email, Username` เพื่อแก้ error `column users.email does not exist`
- **ไฟล์หลัก:** `src/pages/AdminReports.jsx`, `docs/PROJECT_PROGRESS_LOG.md`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run test:run -- src/utils/orderDetailReportExport.test.js` (5 tests), `npm run build`, `ReadLints`
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** utility ยังรองรับข้อมูล lowercase ถ้ามีการส่ง object เข้ามาจากแหล่งอื่น แต่ Supabase select ต้องไม่ระบุคอลัมน์ที่ไม่มีจริง

### 2026-06-11 — [feat] Excel รายงานออเดอร์ละเอียดใน Admin Reports
- **สรุป:** เพิ่มปุ่มส่งออก Excel รายงานออเดอร์ละเอียดในหน้า `AdminReports`; utility แยกสร้างชีตออเดอร์/ลูกค้า/สินค้า/สรุปรวม/รายวัน; ยอดระดับออเดอร์ dedupe ต่อ `OrderID` ก่อนรวม และ parser แยกส่วนลดโค้ด/โปรโมชั่นโดยไม่จับ `Batch ID`
- **ไฟล์หลัก:** `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`, `docs/README.md`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run test:run -- src/utils/orderDetailReportExport.test.js` (5 tests), `npm run build`, `ReadLints`
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** ไฟล์ export เป็น Excel XML `.xls` เพื่อเปิดใน Excel ได้โดยไม่เพิ่ม dependency ใหม่

### 2026-06-10 — [feat] โปรซื้อครบยอด ส่งฟรีตาม Supplier
- **สรุป:** เพิ่ม promotion type `free_shipping_min_purchase` สำหรับซื้อครบยอดแล้วส่งฟรี; แอดมินเลือก Supplier ที่เข้าร่วมได้; Checkout คำนวณยอดขั้นต่ำเฉพาะ Supplier ที่เข้าเงื่อนไขและลดเฉพาะ `shippingShare` ของ Supplier นั้น ไม่รวมเป็นส่วนลดสินค้า
- **ไฟล์หลัก:** `supabase/migrations/20260610233400_promotion_free_shipping_min_purchase.sql`, `src/utils/promotionUtils.js`, `src/utils/couponSupplierSplitUtils.js`, `src/utils/promotionUtils.test.js`, `src/pages/AdminPromotions.jsx`, `src/pages/Checkout.jsx`, `src/services/orderService.js`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run test -- --run src/utils/promotionUtils.test.js` (18 tests), `npm run build`
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** ต้องรัน migration `20260610233400_promotion_free_shipping_min_purchase.sql` บน Supabase ก่อนสร้างโปรประเภท “ซื้อครบยอด ส่งฟรี”

### 2026-05-30 — [fix] ลายเซ็นใบกำกับภาษีไม่แสดง
- **สรุป:** ตัด fallback URL ลายเซ็นเก่าที่ตอบ `403 Forbidden`; กรอง URL ลายเซ็น legacy จาก settings; ปรับหน้าพิมพ์ให้รอรูปในเอกสารโหลดก่อนเรียก `print()` เพื่อให้ลายเซ็น/โลโก้ติดใน PDF มากขึ้น
- **ไฟล์หลัก:** `src/services/printService.js`, `src/services/shopSettingsService.js`, `src/utils/constants.js`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run build`; ตรวจ default signature URL ได้ `403 Forbidden`
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** ถ้าต้องการให้ลายเซ็นขึ้น ต้องบันทึกลายเซ็นใหม่ใน Admin Settings หรือใส่ URL รูปที่เข้าถึงได้

### 2026-05-21 — [feat] โปรโมชั่นตามกลุ่มลูกค้าและโควต้าสินค้า
- **สรุป:** เพิ่มการกำหนดโปรสำหรับ `all`/`regular`/`franchise`; เพิ่มโควต้าจำนวนสินค้า X ที่จัดโปรพร้อม partial apply เมื่อเหลือน้อยกว่าจำนวนในตะกร้า; Checkout นับจำนวนสินค้าโปรที่ใช้และ orderService ปิดโปรอัตโนมัติเมื่อครบโควต้าหรือสต็อกหมด
- **ไฟล์หลัก:** `supabase/migrations/20260521095900_promotion_role_product_quota.sql`, `src/utils/promotionUtils.js`, `src/pages/AdminPromotions.jsx`, `src/pages/Checkout.jsx`, `src/services/orderService.js`, `src/utils/promotionUtils.test.js`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run test -- --run src/utils/promotionUtils.test.js` (15 tests), `npm run build`
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** Supabase CLI ไม่อยู่ใน PATH จึงสร้าง migration file โดยตรง; ต้องรัน migration `20260521095900` บน Supabase ก่อนใช้ฟิลด์ใหม่

### 2026-05-19 — [feat] โปรชิ้นที่ 2 ลด + จำกัดการใช้โปร
- **สรุป:** เพิ่มประเภท `second_item_discount`; ฟิลด์ `UsageLimit`/`TotalUsageLimit`/`UsageCount`; Checkout ตรวจโควต้าก่อนใช้โปร; บันทึก `PromoIds:` ใน DiscountInfo และนับต่อคน
- **ไฟล์หลัก:** `supabase/migrations/20260519130000_promotion_second_item_usage_limits.sql`, `src/pages/AdminPromotions.jsx`, `src/pages/Checkout.jsx`, `src/services/orderService.js`, `src/utils/promotionUtils.test.js`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run build`, `vitest src/utils/promotionUtils.test.js` (10 tests)
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** รัน migration `20260519130000` (และ `20260519120000` ถ้ายังไม่รัน) บน Supabase

### 2026-05-19 — [fix/feat] โปรโมชั่น: logic ตรง Checkout + UI แอดมิน
- **สรุป:** รวม logic โปรใน `promotionUtils` — ส่วนลดเงินหักต่อชิ้น, ประเภท `target_unit_price` (ลดเหลือ X บาท/ชิ้น), วันสิ้นสุดนับถึงสิ้นวัน; Checkout ใช้ util เดียวกับแอดมิน; ฟอร์มแอดมินมีคำอธิบายและ preview
- **ไฟล์หลัก:** `src/utils/promotionUtils.js`, `src/utils/promotionUtils.test.js`, `src/pages/Checkout.jsx`, `src/pages/AdminPromotions.jsx`, `supabase/migrations/20260519120000_promotion_target_unit_price.sql`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run build`, `vitest src/utils/promotionUtils.test.js` (9 tests)
- **ลบไฟล์ชั่วคราว:** -
- **หมายเหตุ:** รัน migration `20260519120000_promotion_target_unit_price.sql` บน Supabase ก่อนบันทึกโปรประเภท «ราคาพิเศษต่อชิ้น»

### 2026-05-18 — [docs] สรุปปิดรอบงานรายวัน
- **สรุป:** รวบรวมงานพัฒนาและตั้งค่า repo ในวันเดียว — ฟีเจอร์แอดมิน/แฟรนไชส์, แก้การแสดงชื่อสินค้า (BUNDLE_IDS), เปิด Git ครั้งแรกและอัปโหลด GitHub
- **ฟีเจอร์หลัก:** (1) `AdminReports` — ไม่นับออเดอร์ยกเลิก, จัดอันดับสินค้าขายดี qty/revenue, ดู/พิมพ์ใบกำกับ (2) `printService` + `AdminOrders` + `PackingModal` — ซ่อน BUNDLE_IDS (3) `AdminDashboard` — UI สินค้าขายดี/ลูกค้า (4) `StockManagement` + `FranchiseStockManagement` — มุมมอง ทั้งหมด / ตามซัพพลาย
- **Git / GitHub:** `git init` → commit `a74847e` (227 ไฟล์) → `origin` [saocafe31-pixel/app-rangsan](https://github.com/saocafe31-pixel/app-rangsan) สาขา `main`; `.env.local` ไม่ถูก commit
- **ไฟล์หลัก:** ดูรายการ `2026-05-18` ด้านล่างในไฟล์นี้; `README.md` (ลิงก์ repo)
- **ตรวจสอบ:** `npm run build` ผ่าน, `git push -u origin main` สำเร็จ
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-18 — [chore] เปิด Git repository และ push ขึ้น GitHub
- **สรุป:** เริ่มใช้ Git ในโปรเจกต์ครั้งแรก — initial commit รวมโค้ดและเอกสารทั้งหมด แล้วเชื่อม remote และ push สาขา `main`
- **ไฟล์หลัก:** `.git/` (local), remote `https://github.com/saocafe31-pixel/app-rangsan.git`
- **ตรวจสอบ:** `git status` clean, `git log -1` = `a74847e`, `origin/main` ตรงกับ local
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-18 — [feat] จัดการสต็อกแฟรนไชส์: มุมมองทั้งหมด / ตามซัพพลาย
- **สรุป:** หน้าจัดการสต็อกแฟรนไชส์ (แท็บสต็อกทั้งหมดและแจ้งเตือนสต็อกต่ำ) มีปุ่มสลับ «ทั้งหมด» / «ตามซัพพลาย» เหมือนแอดมิน — การ์ดซัพ กดเข้าแล้วเห็นตารางสินค้าพร้อมปุ่มจัดการเดิม
- **ไฟล์หลัก:** `src/pages/FranchiseStockManagement.jsx`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** read_lints `FranchiseStockManagement.jsx`, `npm run build`
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-18 — [feat] จัดการสต็อก: มุมมองทั้งหมด / ตามซัพพลาย
- **สรุป:** หน้าจัดการสต็อกมีปุ่มสลับ «ทั้งหมด» กับ «ตามซัพพลาย» — โหมดซัพแสดงการ์ดซัพ (จำนวนสินค้า สต็อกรวม แจ้งใกล้หมด) กดเข้าแล้วเห็นตารางสินค้าเดิมของซัพนั้น พร้อมค้นหาแยกตามบริบท
- **ไฟล์หลัก:** `src/pages/StockManagement.jsx`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** read_lints `StockManagement.jsx`
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-18 — [feat] ปรับ UI แดชบอร์ด + ซ่อน BUNDLE_IDS ในสินค้าขายดี
- **สรุป:** รวมยอดสินค้าขายดีด้วย `getOrderItemDisplayName` (ไม่แสดง BUNDLE_IDS); ปรับการ์ดสินค้าขายดี/ลูกค้าพร้อมแถบเปรียบเทียบ เลือกจัดอันดับตามจำนวนหรือยอดขาย
- **ไฟล์หลัก:** `src/pages/AdminDashboard.jsx`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** read_lints `AdminDashboard.jsx`
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-18 — [fix] ซ่อน BUNDLE_IDS ในหน้าพิมพ์และ UI ออเดอร์แอดมิน
- **สรุป:** หน้าพิมพ์รายการซัพพลายภายนอกตั้ง `hideBundleIds: true` ให้ตัด `BUNDLE_IDS:` ออกจากชื่อสินค้า; ฟอร์มแก้ไขออเดอร์และ PackingModal แสดงชื่อผ่าน `getOrderItemDisplayName`
- **ไฟล์หลัก:** `src/services/printService.js`, `src/pages/AdminOrders.jsx`, `src/components/PackingModal.jsx`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** read_lints ไฟล์ที่แก้
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-18 — [feat] ปรับหน้ารายงานแอดมิน (ยกเลิก / จัดอันดับ / พิมพ์ใบกำกับ)
- **สรุป:** โหมด «ออเดอร์ทั้งหมดในช่วง» ไม่นับออเดอร์ยกเลิก; เพิ่มตัวเลือกจัดอันดับสินค้าขายดีตามยอดขายหรือจำนวนขาย; แท็บสรุปใบกำกับภาษีมีปุ่มดู/พิมพ์ผ่าน `printService`
- **ไฟล์หลัก:** `src/pages/AdminReports.jsx`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** read_lints `AdminReports.jsx`
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-13 — [feat] ชื่อสินค้า UI + รายงานใบกำกับภาษี
- **สรุป:** เพิ่ม `formatOrderItemLinesForDisplay` / `getOrderItemDisplayName` และใช้ในรายงาน/ออเดอร์/พิมพ์; แท็บสรุปใบกำกับภาษีใน AdminReports + `getTaxInvoicesForAdminReport`; ปรับ `printService.lineNameHtmlByPolicy` ให้ตัด BUNDLE_IDS ในบรรทัดเดียวกับชื่อ
- **ไฟล์หลัก:** `src/utils/orderBundleLineUtils.js`, `src/services/printService.js`, `src/services/taxInvoiceService.js`, `src/pages/AdminReports.jsx`, `AdminOrders.jsx`, `History.jsx`, `PackingModal.jsx`, `FranchiseStockManagement.jsx`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** read_lints ไฟล์ที่แก้
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-13 — [feat] รายงานแอดมิน: เลือกดึง order ทั้งหมด vs เฉพาะจัดส่งแล้ว
- **สรุป:** เพิ่ม `salesOrderScope` และตัวเลือกวิทยุในแผงช่วงวันที่; `fetchSalesReport` / `fetchStockReport` ใช้ `filterOrdersByDateRange` + `applySalesOrderScope`; การ์ดและแบนเนอร์อัปเดตตามช่วงและตัวเลือก; ปรับ CSV export และคำอธิบายการ์ดจำนวนออเดอร์
- **ไฟล์หลัก:** `src/pages/AdminReports.jsx`, `docs/PROGRESS_LOG.md`
- **ตรวจสอบ:** `npm run test:run` (มีเทสต์เดิม cartSupplierUtils ล้ม 1 รายการ — ไม่เกี่ยวกับการเปลี่ยนนี้), read_lints AdminReports
- **ลบไฟล์ชั่วคราว:** -

### 2026-05-12 — [docs] Progress log บังคับ + sync กฎ Agent
- **สรุป:** กำหนดนโยบายบันทึก progress ใน `docs/PROGRESS_LOG.md`; อัปเดต `project-workflow.mdc`, `AGENTS.md`, `PROJECT_WORKFLOW_REPORT.md` หัวข้อ 6 และดัชนี README ให้สอดกัน; ลบข้อความท้ายที่ไม่จำเป็นในรายงาน workflow
- **ไฟล์หลัก:** `docs/PROGRESS_LOG.md`, `.cursor/rules/project-workflow.mdc`, `AGENTS.md`, `docs/PROJECT_WORKFLOW_REPORT.md`, `README.md`, `docs/README.md`
- **ตรวจสอบ:** ตรวจ path ลิงก์ relative ที่อ้างถึงไฟล์ใหม่
- **ลบไฟล์ชั่วคราว:** -
