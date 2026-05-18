-- ============================================
-- เพิ่ม Primary Key ให้ตาราง users
-- ============================================
-- 
-- ⚠️ ตรวจสอบก่อนรัน:
-- 1. ตรวจสอบว่าตาราง users มี Primary Key หรือไม่
-- 2. ถ้ามี Primary Key อยู่แล้ว ไม่ต้องรัน script นี้
-- ============================================

-- ตรวจสอบว่ามี Primary Key หรือไม่
DO $$
DECLARE
  has_primary_key BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'users'
    AND constraint_type = 'PRIMARY KEY'
  ) INTO has_primary_key;
  
  IF NOT has_primary_key THEN
    -- เพิ่มคอลัมน์ id ถ้ายังไม่มี
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'id'
    ) THEN
      ALTER TABLE users ADD COLUMN id BIGSERIAL PRIMARY KEY;
      RAISE NOTICE 'Added id column as Primary Key';
    ELSE
      -- ถ้ามีคอลัมน์ id อยู่แล้ว แต่ยังไม่ใช่ Primary Key
      ALTER TABLE users ADD PRIMARY KEY (id);
      RAISE NOTICE 'Set id column as Primary Key';
    END IF;
  ELSE
    RAISE NOTICE 'Table users already has a Primary Key';
  END IF;
END $$;

-- ตรวจสอบผลลัพธ์
SELECT 
  constraint_name, 
  constraint_type,
  table_name
FROM information_schema.table_constraints
WHERE table_name = 'users' 
AND constraint_type = 'PRIMARY KEY';

-- ============================================
-- หมายเหตุ:
-- - Script นี้จะเพิ่ม Primary Key ให้ตาราง users
-- - ใช้ id เป็น Primary Key (BIGSERIAL = auto-increment)
-- - ถ้ามี Primary Key อยู่แล้ว จะไม่ทำอะไร
-- ============================================
