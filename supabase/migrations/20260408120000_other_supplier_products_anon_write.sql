-- แฟรนไชส์ล็อกอินด้วยตาราง users (custom) — ไม่มี JWT ของ Supabase Auth
-- เดิมมีเฉพาะ INSERT/UPDATE สำหรับ authenticated จึงบันทึกรายการซัพนอก/รูปไม่ได้
-- อนุญาต anon ให้สอดคล้องกับ storage product-images (anon INSERT) ใน migration 20260325100000

DROP POLICY IF EXISTS "Allow anon insert other_supplier_products" ON public.other_supplier_products;
CREATE POLICY "Allow anon insert other_supplier_products" ON public.other_supplier_products
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update other_supplier_products" ON public.other_supplier_products;
CREATE POLICY "Allow anon update other_supplier_products" ON public.other_supplier_products
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
