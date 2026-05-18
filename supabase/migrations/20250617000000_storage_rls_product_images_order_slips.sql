-- RLS policies สำหรับ Storage buckets เพื่อแก้ "new row violates row-level security policy"
-- ใช้กับ bucket: product-images (รูปสินค้าในจัดการสต็อก) และ order-slips (สลิป/ลายเซ็น)
-- อ้างอิง: https://supabase.com/docs/guides/storage/security/access-control

-- ลบ policy เดิมถ้ามี (กรณีเคยสร้างจาก Dashboard หรือรัน migration ซ้ำ)
DO $$
BEGIN
  DROP POLICY IF EXISTS "storage_product_images_insert_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "storage_product_images_select_anon" ON storage.objects;
  DROP POLICY IF EXISTS "storage_product_images_select_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "storage_order_slips_insert_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "storage_order_slips_select_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "storage_order_slips_select_public" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL; -- ถ้า schema/table ยังไม่มี ข้าม
END $$;

-- ========== product-images (รูปสินค้า - หน้าจัดการสต็อก / เพิ่มสินค้า) ==========
-- INSERT: ให้ผู้ที่ login แล้ว (authenticated) อัปโหลดได้
CREATE POLICY "storage_product_images_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- SELECT: ให้ทุกคนอ่านได้ (anon + authenticated) สำหรับรูปสินค้า
CREATE POLICY "storage_product_images_select_anon"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'product-images');

CREATE POLICY "storage_product_images_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images');

-- ========== order-slips (สลิปโอนเงิน / ลายเซ็น) ==========
-- INSERT: ให้ผู้ที่ login แล้วอัปโหลดได้
CREATE POLICY "storage_order_slips_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-slips');

-- SELECT: ให้ authenticated และ anon อ่านได้ (ลิงก์สลิปเปิดได้)
CREATE POLICY "storage_order_slips_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'order-slips');

CREATE POLICY "storage_order_slips_select_public"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'order-slips');
