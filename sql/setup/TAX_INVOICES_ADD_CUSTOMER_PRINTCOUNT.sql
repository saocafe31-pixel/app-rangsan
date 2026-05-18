-- แก้ป๊อปอัพ "ไม่พบข้อมูลใบกำกับภาษี" หลังพิมพ์สำเร็จ (ลูกค้าหน้าใบกำกับภาษี)
-- สาเหตุ: โค้ดอ่านคอลัมน์ customer_printcount แต่ตารางยังไม่มี
-- รันครั้งเดียวใน Supabase → SQL Editor

ALTER TABLE tax_invoices
  ADD COLUMN IF NOT EXISTS customer_printcount INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN tax_invoices.customer_printcount IS 'จำนวนครั้งที่ลูกค้าพิมพ์ใบกำกับ';
