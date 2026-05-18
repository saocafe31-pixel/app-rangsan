-- ============================================
-- เปลี่ยน Type ของ Column RegisteredDate จาก 'time' เป็น 'timestamp with time zone'
-- ============================================
-- 
-- ⚠️ หมายเหตุ:
-- - Script นี้จะเปลี่ยน type ของ column RegisteredDate
-- - ข้อมูลเดิมที่เป็น time จะถูกแปลงเป็น timestamp (ใช้เวลาปัจจุบัน)
-- - Default value จะถูกตั้งเป็น NOW()
-- ============================================

-- ตรวจสอบ type ปัจจุบัน
SELECT 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name = 'RegisteredDate';

-- ============================================
-- เปลี่ยน Type จาก 'time' เป็น 'timestamp with time zone'
-- ============================================

DO $$
BEGIN
  -- ตรวจสอบว่า column เป็น type 'time' หรือไม่
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'RegisteredDate'
    AND data_type = 'time without time zone'
  ) THEN
    -- เปลี่ยน type จาก 'time' เป็น 'timestamp with time zone'
    -- ข้อมูลเดิมที่เป็น time จะถูกแปลงเป็น timestamp (ใช้เวลาปัจจุบัน)
    ALTER TABLE users 
    ALTER COLUMN "RegisteredDate" TYPE timestamp with time zone 
    USING CASE 
      WHEN "RegisteredDate" IS NOT NULL 
      THEN NOW() -- ใช้เวลาปัจจุบันสำหรับข้อมูลเดิม
      ELSE NULL 
    END;
    
    -- ตั้งค่า default value เป็น NOW()
    ALTER TABLE users 
    ALTER COLUMN "RegisteredDate" SET DEFAULT NOW();
    
    RAISE NOTICE 'Changed RegisteredDate from time to timestamp with time zone';
  ELSIF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'RegisteredDate'
    AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE NOTICE 'RegisteredDate is already timestamp with time zone';
    
    -- ตั้งค่า default value เป็น NOW() (ถ้ายังไม่มี)
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'RegisteredDate'
      AND column_default IS NOT NULL
    ) THEN
      ALTER TABLE users 
      ALTER COLUMN "RegisteredDate" SET DEFAULT NOW();
      RAISE NOTICE 'Set default value to NOW()';
    END IF;
  ELSE
    RAISE NOTICE 'RegisteredDate column not found or has different type';
  END IF;
END $$;

-- ============================================
-- ตรวจสอบ Type หลังแก้ไข
-- ============================================

SELECT 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name = 'RegisteredDate';

-- ============================================
-- หมายเหตุ:
-- - Type ถูกเปลี่ยนเป็น 'timestamp with time zone' แล้ว
-- - Default value ถูกตั้งเป็น NOW() แล้ว
-- - ข้อมูลเดิมที่เป็น time ถูกแปลงเป็น timestamp (ใช้เวลาปัจจุบัน)
-- - หลังจากนี้ INSERT ใหม่จะใช้ timestamp อัตโนมัติ
-- ============================================
