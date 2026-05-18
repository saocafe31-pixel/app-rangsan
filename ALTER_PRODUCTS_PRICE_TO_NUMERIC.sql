-- ============================================
-- เปลี่ยนคอลัมน์ราคา/ต้นทุน จาก int8 เป็น numeric(10,2)
-- เพื่อรองรับทศนิยม 2 ตำแหน่ง (เช่น 99.50, 3.25)
-- ============================================
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางแล้ว Run
-- ============================================

-- ตรวจสอบชื่อคอลัมน์จริง (รันแยกก่อนก็ได้):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'products'
--   AND (column_name ILIKE '%price%' OR column_name ILIKE '%cost%');

-- ========== ใช้ชุดนี้ถ้า Table Editor แสดงเป็น Price, Cost, FranchisePrice (PascalCase) ==========
-- หมายเหตุ: ใช้ comma (,) คั่นแต่ละ ALTER COLUMN ในคำสั่งเดียว ห้ามใส่ ; กลางคำสั่ง
ALTER TABLE products
  ALTER COLUMN "Price" TYPE numeric(10,2) USING COALESCE("Price", 0)::numeric(10,2),
  ALTER COLUMN "Cost" TYPE numeric(10,2) USING COALESCE("Cost", 0)::numeric(10,2),
  ALTER COLUMN "FranchisePrice" TYPE numeric(10,2) USING COALESCE("FranchisePrice", 0)::numeric(10,2);

-- ========== หรือใช้ชุดนี้ถ้าชื่อคอลัมน์เป็นตัวเล็ก (price, cost) ==========
-- ALTER TABLE products
--   ALTER COLUMN price TYPE numeric(10,2) USING COALESCE(price, 0)::numeric(10,2),
--   ALTER COLUMN cost TYPE numeric(10,2) USING COALESCE(cost, 0)::numeric(10,2);
-- ALTER TABLE products
--   ALTER COLUMN franchiseprice TYPE numeric(10,2) USING COALESCE(franchiseprice, 0)::numeric(10,2);
