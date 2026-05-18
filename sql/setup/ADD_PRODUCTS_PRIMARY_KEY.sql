-- ============================================
-- เพิ่ม Primary Key ให้ตาราง products
-- ============================================
-- ตาราง products ยังไม่มี primary key จึงส่งออกหรือแก้ไขใน Table Editor อาจมีข้อจำกัด
-- เลือกใช้แบบใดแบบหนึ่งด้านล่าง (รันใน Supabase → SQL Editor)
-- ============================================

-- --------------------------------------------
-- ตัวเลือกที่ 1: เพิ่มคอลัมน์ id เป็น PK (แนะนำ — ปลอดภัย ไม่ต้องแก้ข้อมูลเดิม)
-- --------------------------------------------
-- แอปยังใช้ ProductID ในการอ้างอิงสินค้าอยู่ ไม่ต้องเปลี่ยนโค้ด
-- คอลัมน์ id ใช้สำหรับให้ตารางมี PK (ส่งออก/แก้ไขได้)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass AND contype = 'p'
  ) THEN
    -- เพิ่มคอลัมน์ id ถ้ายังไม่มี
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'id'
    ) THEN
      ALTER TABLE public.products
        ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid();
      RAISE NOTICE 'Added column id (uuid) as Primary Key to public.products';
    ELSE
      ALTER TABLE public.products ADD PRIMARY KEY (id);
      RAISE NOTICE 'Set existing column id as Primary Key on public.products';
    END IF;
  ELSE
    RAISE NOTICE 'Table public.products already has a Primary Key';
  END IF;
END $$;

-- --------------------------------------------
-- ตัวเลือกที่ 2: ใช้ ProductID เป็น Primary Key
-- --------------------------------------------
-- ใช้เฉพาะเมื่อ ProductID ไม่มีค่า NULL และไม่ซ้ำ
-- ก่อนรันแบบที่ 2 ให้รันแบบที่ 1 ไว้ก่อน หรือลบ PK ที่มีอยู่ แล้วค่อยรันด้านล่าง

/*
-- ขั้นตอนที่ 1: ตรวจสอบว่ามี ProductID เป็น NULL หรือซ้ำหรือไม่
SELECT "ProductID", COUNT(*) 
FROM public.products 
GROUP BY "ProductID" 
HAVING COUNT(*) > 1 OR "ProductID" IS NULL;

-- ถ้ามี NULL: แก้ให้มีค่า (เช่น UPDATE public.products SET "ProductID" = 'P' || id WHERE "ProductID" IS NULL;)
-- ถ้ามีซ้ำ: แก้ให้ไม่ซ้ำก่อน

-- ขั้นตอนที่ 2: ลบ PK แบบ id ออกถ้าเพิ่มไว้แล้ว (ถ้าต้องการใช้แค่ ProductID)
-- ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_pkey;

-- ขั้นตอนที่ 3: ทำให้ ProductID ไม่เป็น NULL และตั้งเป็น PK
-- ALTER TABLE public.products ALTER COLUMN "ProductID" SET NOT NULL;
-- ALTER TABLE public.products ADD PRIMARY KEY ("ProductID");
*/

-- ตรวจสอบผลลัพธ์
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public' AND table_name = 'products' AND constraint_type = 'PRIMARY KEY';
