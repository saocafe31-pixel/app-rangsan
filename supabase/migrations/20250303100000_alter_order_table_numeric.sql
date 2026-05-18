-- แก้ตาราง "order" ให้คอลัมน์ราคา/จำนวนเงินรองรับทศนิยม (numeric)
-- ใช้เมื่อ products.Price เปลี่ยนเป็น numeric แล้ว แต่ตาราง order ยังเป็น int8/bigint
-- รันผ่าน: supabase db push หรือ Supabase Dashboard → SQL Editor

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Price') THEN
    ALTER TABLE "order" ALTER COLUMN "Price" TYPE numeric(10,2) USING COALESCE("Price", 0)::numeric(10,2);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Total') THEN
    ALTER TABLE "order" ALTER COLUMN "Total" TYPE numeric(10,2) USING COALESCE("Total", 0)::numeric(10,2);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Discount') THEN
    ALTER TABLE "order" ALTER COLUMN "Discount" TYPE numeric(10,2) USING COALESCE("Discount", 0)::numeric(10,2);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Weight') THEN
    ALTER TABLE "order" ALTER COLUMN "Weight" TYPE numeric(12,2) USING COALESCE("Weight", 0)::numeric(12,2);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'Shipping Cost') THEN
    ALTER TABLE "order" ALTER COLUMN "Shipping Cost" TYPE numeric(10,2) USING COALESCE("Shipping Cost", 0)::numeric(10,2);
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'shipping cost') THEN
    ALTER TABLE "order" ALTER COLUMN "shipping cost" TYPE numeric(10,2) USING COALESCE("shipping cost", 0)::numeric(10,2);
  END IF;
END $$;
