-- รันใน Supabase SQL Editor ถ้าอัปโหลดรูป (bucket product-images) ได้ error RLS / 403
-- ใช้กับรูปสินค้าซัพอื่น (โฟลเดอร์ other-supplier/) และรูปสินค้าหลัก
-- ล็อกอินแบบอีเมล+รหัสผ่าน (ตาราง users) ไม่มี JWT → อัปโหลดทำในบทบาท anon
-- ถ้าเคยรัน migration 20250617000000 อย่างเดียวโดยไม่มี 20260325100000 อาจมีแค่ INSERT สำหรับ authenticated

DROP POLICY IF EXISTS "storage_product_images_insert_anon" ON storage.objects;
CREATE POLICY "storage_product_images_insert_anon"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'product-images');
