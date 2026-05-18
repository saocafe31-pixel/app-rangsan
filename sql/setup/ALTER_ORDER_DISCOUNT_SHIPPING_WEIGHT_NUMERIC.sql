-- ============================================
-- แก้ตาราง "order" ให้ Discount / "Shipping Cost" / Weight รองรับทศนิยม (numeric)
-- ใช้เมื่อต้องการเก็บค่าทศนิยม เช่น ส่วนลด 12.5 บาท, ค่าจัดส่ง 45.50, น้ำหนัก 2.5 กก.
-- ============================================
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางแล้ว Run
-- หรือ: npm run supabase db push (ถ้าใช้ migration ด้านล่าง)
-- ============================================

DO $$
BEGIN
  -- Discount (ส่วนลด)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Discount') THEN
    ALTER TABLE "order" ALTER COLUMN "Discount" TYPE numeric(10,2) USING COALESCE("Discount", 0)::numeric(10,2);
  END IF;

  -- Shipping Cost (ค่าจัดส่ง) — ชื่อคอลัมน์มีช่องว่าง ต้องใช้ double quotes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Shipping Cost') THEN
    ALTER TABLE "order" ALTER COLUMN "Shipping Cost" TYPE numeric(10,2) USING COALESCE("Shipping Cost", 0)::numeric(10,2);
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'shipping cost') THEN
    ALTER TABLE "order" ALTER COLUMN "shipping cost" TYPE numeric(10,2) USING COALESCE("shipping cost", 0)::numeric(10,2);
  END IF;

  -- Weight (น้ำหนัก กก.)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Weight') THEN
    ALTER TABLE "order" ALTER COLUMN "Weight" TYPE numeric(12,2) USING COALESCE("Weight", 0)::numeric(12,2);
  END IF;
END $$;
