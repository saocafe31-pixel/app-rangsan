# ตารางที่อ้างอิง ProductID

เมื่อแอดมิน**แก้ไขรหัสสินค้า (ProductID)** ในหน้า จัดการสต็อก ระบบจะอัปเดตตารางที่อ้างอิง ProductID ให้ตรงกับรหัสใหม่โดยอัตโนมัติ

---

## ตารางที่อัปเดตอัตโนมัติ (เมื่อเปลี่ยน ProductID)

| ตาราง | คอลัมน์ | หมายเหตุ |
|--------|---------|----------|
| **products** | ProductID | ตารางหลัก สินค้า |
| **franchise_stock** | productid | สต็อกแฟรนไชส์ |
| **franchise_stock_logs** | productid | ประวัติรับเข้า/เบิกออกแฟรนไชส์ |
| **promotions** | ProductID, GetProductID | โปรโมชั่น (ซื้อ X แถม Y) |
| **po_items** | productid | รายการใน Purchase Order |
| **stock_logs** | productid | ประวัติการเคลื่อนไหวสต็อก (หน้าหลัก) |

การอัปเดตทำใน `productService.updateProduct()` เมื่อมีการส่ง `updates.id` (รหัสใหม่) ที่แตกต่างจากรหัสเดิม

---

## ตารางที่ไม่เก็บ ProductID

| ตาราง | หมายเหตุ |
|--------|----------|
| **order** | เก็บ **Itemname** (ชื่อสินค้า) ต่อแถว ไม่เก็บ ProductID จึงไม่ต้องอัปเดต |
| **credit_transactions** | ไม่เกี่ยวกับสินค้า |
| **credit_usage_log** | ไม่เกี่ยวกับสินค้า |
| **user_credits** | ไม่เกี่ยวกับสินค้า |
| **notifications** | ไม่เกี่ยวกับสินค้า |
| **tax_invoices** | อ้างอิง orderid |
| **purchase_orders** | เก็บหัว PO ไม่เก็บ productid โดยตรง (รายการอยู่ที่ po_items) |

---

## การใช้งานในแอป (โดยย่อ)

- **productService** – อ่าน/เขียน products ด้วย ProductID
- **franchiseStockService** – ใช้ productid กับ franchise_stock, franchise_stock_logs
- **poService** – ใช้ productid กับ po_items และ products
- **AdminPromotions / Checkout** – ใช้ ProductID, GetProductID จาก promotions
- **orderService** – สร้างออเดอร์ใช้ Itemname (ชื่อสินค้า) ไม่ใช้ ProductID ในแถวออเดอร์

---

## หมายเหตุ

- หลังแก้รหัสสินค้า โปรโมชั่นที่ผูกกับสินค้านั้นจะยังชี้ไปที่รหัสใหม่อัตโนมัติ
- รายการ PO (po_items) และประวัติสต็อก (stock_logs, franchise_stock_logs) จะถูกอัปเดตให้ชี้ไปที่รหัสใหม่ เพื่อให้รายงานและประวัติยังผูกกับสินค้าเดิมได้ถูกต้อง
