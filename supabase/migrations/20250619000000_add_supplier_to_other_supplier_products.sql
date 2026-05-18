-- เพิ่มคอลัมน์ supplier ใน other_supplier_products เพื่อแยกรายการตามซัพพลายเมื่อสร้าง PO
ALTER TABLE public.other_supplier_products
  ADD COLUMN IF NOT EXISTS supplier text;

COMMENT ON COLUMN public.other_supplier_products.supplier IS 'ชื่อซัพพลายเออร์ - ใช้แยก PO ตามซัพเมื่อกดสร้าง PO';
