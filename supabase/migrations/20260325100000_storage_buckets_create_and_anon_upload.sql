-- สร้าง Storage buckets ที่แอป APP RANGSAN ใช้ (ถ้ายังไม่มี)
-- อ้างอิงโค้ด: src/services/imageService.js
--   - product-images: รูปสินค้า (StockManagement, AdminProducts), โฟลเดอร์ other-supplier/
--   - order-slips: สลิปเติมเงิน/สั่งซื้อ, โฟลเดอร์ signatures/ (ลายเซ็นใน AdminSettings)
-- Bucket "Logo" สร้างใน Dashboard แล้ว — ไม่ต้องสร้างซ้ำที่นี่
-- company-assets: โลโก้บริษัทบนใบพิมพ์ (LOGO_URL ใน src/utils/constants.js)
--
-- หมายเหตุ: ผู้ใช้ที่ล็อกอินด้วยอีเมล+รหัสผ่าน (custom auth) มักไม่มี JWT ของ Supabase Auth
-- จึงอัปโหลดในบทบาท `anon` — เพิ่ม policy INSERT สำหรับ anon ด้านล่าง

-- ========== สร้าง buckets ==========
-- จำกัดขนาด/MIME ปรับได้ใน Dashboard → Storage → bucket → Configuration
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product-images', 'product-images', true),
  ('order-slips', 'order-slips', true),
  ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

-- ========== Policies: อนุญาตให้ anon อัปโหลด (custom login + anon key) ==========
DROP POLICY IF EXISTS "storage_product_images_insert_anon" ON storage.objects;
CREATE POLICY "storage_product_images_insert_anon"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "storage_order_slips_insert_anon" ON storage.objects;
CREATE POLICY "storage_order_slips_insert_anon"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'order-slips');

-- อ่านโลโก้บริษัทจาก URL สาธารณะ (ใบพิมพ์)
DROP POLICY IF EXISTS "storage_company_assets_select_anon" ON storage.objects;
CREATE POLICY "storage_company_assets_select_anon"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "storage_company_assets_select_authenticated" ON storage.objects;
CREATE POLICY "storage_company_assets_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-assets');
