-- รับ PO บางส่วน: เก็บจำนวนที่รับแล้ว / สถานะแถว / ยกเลิกที่เหลือ
-- แก้ error: Could not find the 'receivedqty' column of 'po_items' in the schema cache

ALTER TABLE po_items ADD COLUMN IF NOT EXISTS receivedqty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS cancelledqty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS cancelreason TEXT;

COMMENT ON COLUMN po_items.receivedqty IS 'จำนวนที่รับเข้าสต็อกแล้ว (สะสม)';
COMMENT ON COLUMN po_items.status IS 'เช่น received, partially_received, cancelled';
COMMENT ON COLUMN po_items.cancelledqty IS 'จำนวนที่ยกเลิกจากยอดที่ยังไม่รับ';
