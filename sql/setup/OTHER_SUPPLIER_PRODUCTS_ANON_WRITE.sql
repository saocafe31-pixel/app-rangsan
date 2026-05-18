-- รันใน Supabase SQL Editor ถ้ายังไม่ได้ push migration 20260408120000_other_supplier_products_anon_write.sql
-- ให้แอป (anon key + ล็อกอินแบบตาราง users) บันทึก/แก้ไข other_supplier_products ได้
--
-- ถ้ายังเห็นข้อความ "กรุณาล็อกอินก่อนบันทึก" = เว็บบน Vercel ยังเป็น bundle เก่า — ต้อง deploy โค้ดล่าสุด
-- ถ้าอัปโหลดรูปแล้ว error — รันเพิ่ม sql/setup/STORAGE_PRODUCT_IMAGES_ANON_INSERT.sql

DROP POLICY IF EXISTS "Allow anon insert other_supplier_products" ON public.other_supplier_products;
CREATE POLICY "Allow anon insert other_supplier_products" ON public.other_supplier_products
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update other_supplier_products" ON public.other_supplier_products;
CREATE POLICY "Allow anon update other_supplier_products" ON public.other_supplier_products
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
