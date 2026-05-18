-- เพิ่มคอลัมน์ is_other_supplier ใน purchase_orders
-- PO ที่เป็น "ซัพนอก" = สร้างเพื่อพิมพ์บิล/ซื้อเอง ไม่ไปหน้าชำระเงิน และรับเข้าสต็อกสาขาทีละรายการได้
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS is_other_supplier boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_orders.is_other_supplier IS 'true = PO สินค้าซัพนอก (พิมพ์บิลซื้อเอง, รับเข้าสต็อกสาขาได้)';
