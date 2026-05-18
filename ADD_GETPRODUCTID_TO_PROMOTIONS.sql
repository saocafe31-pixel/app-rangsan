-- ============================================
-- เพิ่มคอลัมน์ GetProductID ในตาราง promotions
-- สำหรับโปรโมชั่นประเภท buy_x_get_y
-- ============================================

-- Step 1: เพิ่มคอลัมน์ GetProductID
ALTER TABLE promotions
ADD COLUMN IF NOT EXISTS "GetProductID" TEXT;

-- Step 2: เพิ่ม Comment
COMMENT ON COLUMN promotions."GetProductID" IS 'รหัสสินค้าที่ได้เพิ่ม (สินค้า Y สำหรับ buy_x_get_y, NULL = สินค้าเดียวกัน)';

-- Step 3: ตรวจสอบผลลัพธ์
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'promotions' 
AND column_name = 'GetProductID';
