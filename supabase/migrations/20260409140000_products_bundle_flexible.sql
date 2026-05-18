-- ชุดสินค้าแบบลูกค้ากำหนดจำนวนแต่ละส่วนประกอบเอง (ไม่สัดส่วนคงจาก BundleLines.qty)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "BundleFlexible" boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "BundlePrimaryProductId" text;

COMMENT ON COLUMN public.products."BundleFlexible" IS 'true = ลูกค้ากรอกจำนวนแต่ละรหัสในชุดเองตอนสั่ง (ใช้ร่วมกับ BundleLines เป็นรายการรหัสที่เกี่ยวข้อง)';
COMMENT ON COLUMN public.products."BundlePrimaryProductId" IS 'รหัสสินค้าส่วนประกอบหลัก — ใช้คำนวณราคาเป็นช่วงของ OrderStep';
