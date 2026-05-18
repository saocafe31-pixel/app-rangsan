-- คอลัมน์สำหรับรับ PO บางส่วน / ยกเลิกที่เหลือ (ถ้ายังไม่มีในฐานข้อมูล)
-- รันครั้งเดียวบน Supabase SQL Editor หาก receive PO แล้วสต็อกบวกแต่ po_items ไม่อัปเดต

ALTER TABLE po_items ADD COLUMN IF NOT EXISTS receivedqty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS cancelledqty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS cancelreason TEXT;
