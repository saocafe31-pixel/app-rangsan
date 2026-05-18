-- คอลัมน์ customer_printcount ใช้ใน taxInvoiceService.incrementPrintCount (ฝั่งลูกค้าพิมพ์ใบกำกับ)
-- ถ้าไม่มีคอลัมน์นี้ PostgREST จะตอบ 400 และแอปแสดง "ไม่พบข้อมูลใบกำกับภาษี" ทั้งที่พิมพ์สำเร็จแล้ว
ALTER TABLE tax_invoices
  ADD COLUMN IF NOT EXISTS customer_printcount INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN tax_invoices.customer_printcount IS 'จำนวนครั้งที่ลูกค้าพิมพ์ใบกำกับ (แยกจาก printcount ของแอดมิน)';
