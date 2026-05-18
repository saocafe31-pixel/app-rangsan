-- ============================================
-- แก้ตาราง "order" ให้คอลัมน์ราคา/จำนวนเงินรองรับทศนิยม (numeric)
-- ใช้เมื่อ products.Price เปลี่ยนเป็น numeric แล้ว แต่ตาราง order ยังเป็น int8/bigint
-- ทำให้กดสั่งซื้อแล้ว error: invalid input syntax for type bigint: "2.8"
-- ============================================
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางแล้ว Run
-- ============================================

-- ตรวจสอบประเภทคอลัมน์ก่อน (รันแยกได้):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'order'
--   AND column_name IN ('Price', 'Total', 'Discount', 'Weight', 'Qty')
-- ORDER BY ordinal_position;

-- แก้ Price, Total, Discount, Weight ให้เป็น numeric รองรับทศนิยม
-- ถ้าคอลัมน์ชื่อเป็น PascalCase (Price, Total, ...) ใช้ชุดนี้:
DO $$
BEGIN
  -- Price (ราคาต่อหน่วยในแถวออเดอร์)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Price') THEN
    ALTER TABLE "order" ALTER COLUMN "Price" TYPE numeric(10,2) USING COALESCE("Price", 0)::numeric(10,2);
  END IF;
  -- Total (ยอดรวมออเดอร์)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Total') THEN
    ALTER TABLE "order" ALTER COLUMN "Total" TYPE numeric(10,2) USING COALESCE("Total", 0)::numeric(10,2);
  END IF;
  -- Discount (ส่วนลด)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Discount') THEN
    ALTER TABLE "order" ALTER COLUMN "Discount" TYPE numeric(10,2) USING COALESCE("Discount", 0)::numeric(10,2);
  END IF;
  -- Weight (น้ำหนัก)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Weight') THEN
    ALTER TABLE "order" ALTER COLUMN "Weight" TYPE numeric(12,2) USING COALESCE("Weight", 0)::numeric(12,2);
  END IF;
  -- Shipping Cost (คอลัมน์มีช่องว่าง อาจเป็น "Shipping Cost" หรือ shipping cost)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Shipping Cost') THEN
    ALTER TABLE "order" ALTER COLUMN "Shipping Cost" TYPE numeric(10,2) USING COALESCE("Shipping Cost", 0)::numeric(10,2);
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'shipping cost') THEN
    ALTER TABLE "order" ALTER COLUMN "shipping cost" TYPE numeric(10,2) USING COALESCE("shipping cost", 0)::numeric(10,2);
  END IF;
END $$;
