-- ชุดยืดหยุ่นแบบผลรวมส่วนประกอบ (ไม่รวมหลัก) = จำนวนสินค้าหลัก; แต่ละรายการหาร OrderStep ของตัวเองลงตัว

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "BundleComponentSumEqualsPrimary" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products."BundleComponentSumEqualsPrimary" IS 'true = ชุดยืดหยุ่น: ผลรวมจำนวนส่วนประกอบ (ไม่รวมรหัสหลัก) ต้องเท่าจำนวนหลัก; แต่ละรหัสหาร OrderStep ของสินค้านั้นลงตัว';
