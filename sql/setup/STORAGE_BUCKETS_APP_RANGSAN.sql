-- =============================================================================
-- APP RANGSAN — สร้าง Storage buckets + policies (รันครั้งเดียวใน Supabase SQL Editor)
-- =============================================================================
-- สิ่งที่แอปใช้ในโค้ด:
--   • product-images  → รูปสินค้า, other-supplier/  (imageService.uploadImage)
--   • order-slips     → สลิปโอนเงิน, signatures/    (uploadOrderSlip, uploadSignature)
--   • Logo            → โลโก้แอป (สร้างใน Dashboard แล้ว — ไม่มีในไฟล์นี้)
--   • company-assets  → โลโก้บริษัทบนใบพิมพ์ (LOGO_URL ใน constants.js) — สร้าง bucket ว่างแล้วอัปโหลดไฟล์เอง
--
-- หลังรัน: ตรวจ Storage → Policies ของแต่ละ bucket ใน Dashboard ได้
-- =============================================================================

-- ----- Buckets -----
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product-images', 'product-images', true),
  ('order-slips', 'order-slips', true),
  ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

-- ----- ลบ policy ชื่อเดิม (รันซ้ำได้) -----
DO $$
BEGIN
  DROP POLICY IF EXISTS "storage_product_images_insert_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "storage_product_images_select_anon" ON storage.objects;
  DROP POLICY IF EXISTS "storage_product_images_select_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "storage_product_images_insert_anon" ON storage.objects;
  DROP POLICY IF EXISTS "storage_order_slips_insert_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "storage_order_slips_select_authenticated" ON storage.objects;
  DROP POLICY IF EXISTS "storage_order_slips_select_public" ON storage.objects;
  DROP POLICY IF EXISTS "storage_order_slips_insert_anon" ON storage.objects;
  DROP POLICY IF EXISTS "storage_company_assets_select_anon" ON storage.objects;
  DROP POLICY IF EXISTS "storage_company_assets_select_authenticated" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ----- product-images -----
CREATE POLICY "storage_product_images_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "storage_product_images_insert_anon"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "storage_product_images_select_anon"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'product-images');

CREATE POLICY "storage_product_images_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images');

-- ----- order-slips -----
CREATE POLICY "storage_order_slips_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-slips');

CREATE POLICY "storage_order_slips_insert_anon"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'order-slips');

CREATE POLICY "storage_order_slips_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'order-slips');

CREATE POLICY "storage_order_slips_select_public"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'order-slips');

-- ----- company-assets (อ่านสาธารณะสำหรับ URL บนใบพิมพ์) -----
CREATE POLICY "storage_company_assets_select_anon"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'company-assets');

CREATE POLICY "storage_company_assets_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-assets');
