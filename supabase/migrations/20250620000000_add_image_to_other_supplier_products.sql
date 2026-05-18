-- เพิ่มคอลัมน์ image (URL รูปภาพ) ใน other_supplier_products เพื่อแสดงรูปในการ์ดสั่งสินค้าซัพนอก
ALTER TABLE public.other_supplier_products
  ADD COLUMN IF NOT EXISTS image text;

COMMENT ON COLUMN public.other_supplier_products.image IS 'URL รูปภาพสินค้า (optional)';
