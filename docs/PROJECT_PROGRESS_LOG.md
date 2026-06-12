# Project Progress Log

## 2026-06-12 — Excel Report Formatting and Order Total Columns

### Scope
- `fix/UX` — ปรับรูปแบบไฟล์ Excel รายงานออเดอร์ละเอียดและเพิ่มคอลัมน์ที่ช่วยอ่านข้อมูล โดยไม่เปลี่ยน schema หรือข้อมูลจริงในฐานข้อมูล

### Files
- `src/utils/orderDetailReportExport.js`
- `src/utils/orderDetailReportExport.test.js`
- `docs/PROJECT_PROGRESS_LOG.md`
- `docs/PROGRESS_LOG.md`

### Summary
- เพิ่มคอลัมน์ `วันที่สรุปรายวัน` และ `UserEmail` ในชีต `ยอดรวมตามออเดอร์`
- เพิ่ม style ให้ workbook ทุกชีต เช่น header สีเขียว ตัวหนา สีตัวอักษรขาว, border, alternating row background, number format และความกว้างคอลัมน์ตามข้อมูล
- เพิ่ม freeze header row ในทุก worksheet เพื่อให้เลื่อนดูรายงานได้เป็นระเบียบขึ้น

### Impact
- ชีต `ยอดรวมตามออเดอร์` อ่านง่ายขึ้นเมื่อตรวจออเดอร์ย้อนหลัง เพราะเห็นวันที่และอีเมลลูกค้าคู่กับยอดรวมทันที
- ไฟล์ Excel/Google Sheets ที่ export มีรูปแบบตารางชัดเจนขึ้นทุกชีต โดยยังคงรูปแบบ Excel XML `.xls` เดิมและไม่เพิ่ม dependency

### Verification
- `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 6 tests
- `npm run build` ผ่าน
- `ReadLints` ไม่พบ error ในไฟล์ที่แก้

### Rollback
- คืน header/data ของชีต `ยอดรวมตามออเดอร์` กลับก่อนเพิ่ม `วันที่สรุปรายวัน` และ `UserEmail`
- คืน `createOrderDetailReportExcelXml()` กลับเป็น XML แบบไม่มี styles/columns/freeze panes

### Next Step
- Export รายงานจริงแล้วเปิดใน Google Sheets/Excel เพื่อตรวจความกว้างคอลัมน์และสี header บนข้อมูลจำนวนมาก

## 2026-06-12 — Admin Filter Loading UX

### Scope
- `fix/UX` — ปรับประสบการณ์ค้นหา/filter realtime ในหน้าแอดมินโดยไม่เปลี่ยน schema หรือข้อมูลจริงในฐานข้อมูล

### Files
- `src/pages/AdminOrders.jsx`
- `src/pages/AdminDashboard.jsx`
- `src/pages/AdminReports.jsx`
- `docs/PROJECT_PROGRESS_LOG.md`
- `docs/PROGRESS_LOG.md`

### Summary
- แยกสถานะโหลดครั้งแรกออกจากสถานะ refresh หลังผู้ใช้เปลี่ยน filter
- หน้า `AdminOrders`, `AdminDashboard`, และ `AdminReports` จะไม่กลับไป full-page loading screen เมื่อเปลี่ยนวันที่, ค้นหา, เปลี่ยนสถานะ หรือเลือก Supplier หลังข้อมูลชุดแรกโหลดแล้ว
- เพิ่มสถานะ inline “กำลังอัปเดตข้อมูล...” และ icon หมุน เพื่อให้ผู้ใช้รู้ว่าระบบกำลัง refresh โดยยังเห็นข้อมูลเดิมบนหน้า

### Impact
- การค้นหา/filter แบบ realtime ยังทำงานเหมือนเดิม แต่ flow ลื่นขึ้นและไม่กระพริบกลับไปหน้า loading ทั้งหน้า
- ลดความรู้สึกว่าเว็บโหลดใหม่ทุกครั้งเมื่อเปลี่ยน filter ในหน้าจัดการออเดอร์, Dashboard และรายงาน

### Verification
- `npm run build` ผ่าน
- `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 6 tests
- `ReadLints` ไม่พบ error ในไฟล์ที่แก้

### Rollback
- คืนเงื่อนไข `if (loading) return <LoadingSpinner />` ในทั้ง 3 หน้า
- ลบ state `hasLoadedOrders`, `hasLoadedStats`, `hasLoadedReport` และ inline refresh status

### Next Step
- ทดสอบมือโดยเปลี่ยนช่วงวันที่, ค้นหาออเดอร์/ลูกค้า และเลือก Supplier บนหน้าแอดมิน เพื่อยืนยันว่าไม่มี full-page loading ระหว่าง filter

## 2026-06-12 — Sales Reports and Excel Export Reconciliation

### Scope
- `fix/feat` — แก้ความถูกต้องของยอดรายงานและขยาย Excel export โดยไม่เปลี่ยน schema หรือข้อมูลจริงในฐานข้อมูล

### Files
- `src/pages/AdminReports.jsx`
- `src/services/orderService.js`
- `src/utils/orderDetailReportExport.js`
- `src/utils/orderDetailReportExport.test.js`
- `docs/PROJECT_PROGRESS_LOG.md`
- `docs/PROGRESS_LOG.md`

### Summary
- ปรับ `orderService.getAllOrders()` ให้โหลด raw rows จากตาราง `order` แบบแบ่งหน้า 1,000 แถวต่อรอบก่อน group ตาม `OrderID`
- เพิ่มการ enrich `Username` จากตาราง `users` เมื่อ snapshot ในออเดอร์เป็นอีเมลหรือว่าง
- ปรับรายงานยอดขายใน `AdminReports` ให้ใช้ summary จาก utility เดียวกับ Excel: รายได้สินค้า (`Qty * Price`) ลบส่วนลด/โปรโมชั่น บวกค่าจัดส่ง
- เพิ่ม multi Supplier filter ในรายงานยอดขาย และส่ง filter เดียวกันเข้า Excel export
- ขยาย Excel workbook เป็นชีต: `ออเดอร์`, `ยอดรวมตามออเดอร์`, `สรุปยอดซื้อลูกค้า`, `สรุปยอดขายสินค้า`, `สรุปรวม`, `สรุปยอดรายวัน`, `สรุปงบกำไรขาดทุน`
- เพิ่มยอด `ยอดขายรวมที่บันทึกในออเดอร์` และ `ผลต่างยอดบันทึกกับสูตร` เพื่อช่วยตรวจ historical data

### Impact
- Dashboard card, payment summary, top products, top customers, daily summary และ Excel export ใช้สูตรรวมยอดชุดเดียวกัน
- ยอดระดับออเดอร์ dedupe ด้วย `OrderID` ก่อนรวมเสมอ ลดความเสี่ยงนับ `Total`, `Discount`, `Shipping Cost` ซ้ำจากหลาย item rows
- Supplier filter มีผลต่อยอดบนหน้าและไฟล์ Excel ตาม requirement
- การโหลดรายงานไม่ถูกตัดที่ Supabase default 1,000 rows

### Verification
- `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 6 tests
- `npm run build` ผ่าน
- `ReadLints` ไม่พบ error ในไฟล์ที่แก้

### Rollback
- คืน `orderService.getAllOrders()` ไปใช้ query เดิมครั้งเดียว
- คืน `AdminReports` ไปใช้การรวมยอดจาก `order.Total` เดิมและลบ Supplier filter
- คืน `orderDetailReportExport.js` และ test กลับก่อนเพิ่มชีต reconciliation/P&L

### Next Step
- ทดสอบมือบนข้อมูลจริงโดยเลือกช่วงวันที่และ Supplier หลายค่า แล้วเทียบชีต `ยอดรวมตามออเดอร์` กับออเดอร์ตัวอย่างที่มีหลายรายการสินค้า

## 2026-06-11 — Fix: Admin Reports export users column

### Summary
- แก้ปุ่มส่งออก Excel รายงานออเดอร์ละเอียดที่ error `column users.email does not exist`
- ปรับ query ตาราง `users` ให้เลือกเฉพาะคอลัมน์จริง `Email, Username`

### Impact
- Admin สามารถ export รายงานละเอียดได้โดยไม่ถูก Supabase reject จากชื่อคอลัมน์ lowercase ที่ไม่มีในฐานข้อมูล

### Verification
- `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 5 tests
- `npm run build` ผ่าน
- `ReadLints` ไม่พบ error ใน `src/pages/AdminReports.jsx`

### Rollback
- คืน query ใน `exportOrderDetailReport` กลับเป็นค่าเดิม หากฐานข้อมูลปลายทางเปลี่ยน schema เป็น lowercase ทั้งหมด

### Next Step
- ลองกดปุ่ม `รายงานออเดอร์ละเอียด Excel` อีกครั้งบนหน้า Admin Reports

## 2026-06-11 — Admin Reports: Excel รายงานออเดอร์ละเอียด

### Summary
- เพิ่มปุ่มส่งออก Excel รายงานออเดอร์ละเอียดในหน้า `AdminReports` สำหรับแท็บรายงานยอดขาย
- เพิ่ม utility `src/utils/orderDetailReportExport.js` สร้าง workbook หลายชีต: ออเดอร์, สรุปยอดซื้อลูกค้า, สรุปสินค้า, สรุปรวม, สรุปรายวัน
- Summary ทุกชีตที่เป็นยอดระดับออเดอร์ dedupe ต่อ `OrderID` ก่อนรวม เพื่อไม่ให้นับ `Total`, ส่วนลด, ค่าจัดส่งซ้ำจากตาราง `order` ที่เก็บหลายแถวต่อออเดอร์

### Impact
- ผู้ใช้แอดมิน export รายงานละเอียดตามช่วงวันที่และขอบเขตออเดอร์เดียวกับหน้า `AdminReports` ได้
- `Username` ใน export ใช้ชื่อจากตาราง `users` เมื่อ snapshot บนออเดอร์เป็นอีเมลหรือว่าง
- `Supplier` ใช้ product map (`ProductID -> Supplier`) เป็นหลัก และ fallback จากแถวออเดอร์หรือ `DiscountInfo`
- Parser ส่วนลดแยกส่วนลดโค้ด/โปรโมชั่น และไม่จับเลขใน `Batch ID` เป็นส่วนลด

### Verification
- `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 5 tests
- `npm run build` ผ่าน
- `ReadLints` ไม่พบ error ในไฟล์ที่แก้

### Rollback
- ลบปุ่มและ handler `exportOrderDetailReport` ใน `src/pages/AdminReports.jsx`
- ลบ `src/utils/orderDetailReportExport.js` และ `src/utils/orderDetailReportExport.test.js`
- คืนรายการเอกสารใน `docs/README.md`, `docs/PROGRESS_LOG.md`, และไฟล์นี้ตามต้องการ

### Next Step
- ทดสอบมือบนหน้า Admin Reports ด้วยข้อมูลจริง 1 ออเดอร์ที่มีหลายรายการสินค้า เพื่อยืนยันว่าไฟล์ Excel เปิดได้และยอดรวมไม่ซ้ำ
