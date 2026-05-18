-- ============================================
-- เพิ่ม Database Constraints เพื่อความปลอดภัย
-- ============================================
-- 
-- Constraints เหล่านี้จะช่วยป้องกันข้อมูลที่ไม่ถูกต้อง
-- และเพิ่มความปลอดภัยแม้ว่าจะปิด RLS แล้ว
-- ============================================

-- ============================================
-- 0. สร้าง Unique Constraint บน users("Email") ก่อน
-- ============================================
-- ⚠️ จำเป็น: Foreign key ต้อง reference ไปยัง column ที่มี unique constraint หรือ primary key

-- สร้าง unique constraint บน users("Email") ถ้ายังไม่มี
DO $$
BEGIN
  -- ตรวจสอบว่ามี unique constraint หรือ primary key บน Email หรือไม่
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
    AND tc.table_name = 'users'
    AND kcu.column_name = 'Email'
    AND (tc.constraint_type = 'UNIQUE' OR tc.constraint_type = 'PRIMARY KEY')
  ) THEN
    -- สร้าง unique constraint
    ALTER TABLE users
    ADD CONSTRAINT unique_users_email
    UNIQUE ("Email");
    
    RAISE NOTICE 'Added unique constraint: unique_users_email';
  ELSE
    RAISE NOTICE 'Unique constraint or primary key already exists on users("Email")';
  END IF;
END $$;

-- ============================================
-- 1. Foreign Key Constraints
-- ============================================

-- credit_transactions -> users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_credit_transactions_useremail'
    AND table_name = 'credit_transactions'
  ) THEN
    ALTER TABLE credit_transactions
    ADD CONSTRAINT fk_credit_transactions_useremail
    FOREIGN KEY (useremail) REFERENCES users("Email")
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Added foreign key constraint: fk_credit_transactions_useremail';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists: fk_credit_transactions_useremail';
  END IF;
END $$;

-- user_credits -> users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_user_credits_useremail'
    AND table_name = 'user_credits'
  ) THEN
    ALTER TABLE user_credits
    ADD CONSTRAINT fk_user_credits_useremail
    FOREIGN KEY (useremail) REFERENCES users("Email")
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Added foreign key constraint: fk_user_credits_useremail';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists: fk_user_credits_useremail';
  END IF;
END $$;

-- credit_usage_log -> users
DO $$
DECLARE
  column_name_var TEXT;
BEGIN
  -- ตรวจสอบว่ามี column ชื่ออะไร (UserEmail หรือ useremail)
  SELECT column_name INTO column_name_var
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'credit_usage_log'
  AND (column_name = 'UserEmail' OR column_name = 'useremail')
  LIMIT 1;
  
  -- ถ้าไม่พบ column ให้ข้าม
  IF column_name_var IS NULL THEN
    RAISE NOTICE '⚠️ Column UserEmail or useremail not found in credit_usage_log table. Skipping foreign key constraint.';
    RETURN;
  END IF;
  
  -- ตรวจสอบว่ามี constraint อยู่แล้วหรือไม่
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_credit_usage_log_useremail'
    AND table_name = 'credit_usage_log'
  ) THEN
    -- สร้าง foreign key constraint ตาม column name ที่พบ
    IF column_name_var = 'UserEmail' THEN
      ALTER TABLE credit_usage_log
      ADD CONSTRAINT fk_credit_usage_log_useremail
      FOREIGN KEY ("UserEmail") REFERENCES users("Email")
      ON DELETE CASCADE;
    ELSE
      ALTER TABLE credit_usage_log
      ADD CONSTRAINT fk_credit_usage_log_useremail
      FOREIGN KEY (useremail) REFERENCES users("Email")
      ON DELETE CASCADE;
    END IF;
    
    RAISE NOTICE '✅ Added foreign key constraint: fk_credit_usage_log_useremail (column: %)', column_name_var;
  ELSE
    RAISE NOTICE 'ℹ️ Foreign key constraint already exists: fk_credit_usage_log_useremail';
  END IF;
END $$;

-- ============================================
-- 2. Check Constraints
-- ============================================

-- credit_transactions: amount > 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_credit_transactions_amount_positive'
    AND table_name = 'credit_transactions'
  ) THEN
    ALTER TABLE credit_transactions
    ADD CONSTRAINT check_credit_transactions_amount_positive
    CHECK (amount > 0);
    
    RAISE NOTICE 'Added check constraint: check_credit_transactions_amount_positive';
  ELSE
    RAISE NOTICE 'Check constraint already exists: check_credit_transactions_amount_positive';
  END IF;
END $$;

-- credit_transactions: status valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_credit_transactions_status_valid'
    AND table_name = 'credit_transactions'
  ) THEN
    ALTER TABLE credit_transactions
    ADD CONSTRAINT check_credit_transactions_status_valid
    CHECK (status IN ('pending', 'approved', 'rejected'));
    
    RAISE NOTICE 'Added check constraint: check_credit_transactions_status_valid';
  ELSE
    RAISE NOTICE 'Check constraint already exists: check_credit_transactions_status_valid';
  END IF;
END $$;

-- user_credits: balance >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_user_credits_balance_non_negative'
    AND table_name = 'user_credits'
  ) THEN
    ALTER TABLE user_credits
    ADD CONSTRAINT check_user_credits_balance_non_negative
    CHECK (balance >= 0);
    
    RAISE NOTICE 'Added check constraint: check_user_credits_balance_non_negative';
  ELSE
    RAISE NOTICE 'Check constraint already exists: check_user_credits_balance_non_negative';
  END IF;
END $$;

-- ============================================
-- 3. Unique Constraints
-- ============================================

-- user_credits: one record per user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'unique_user_credits_useremail'
    AND table_name = 'user_credits'
  ) THEN
    ALTER TABLE user_credits
    ADD CONSTRAINT unique_user_credits_useremail
    UNIQUE (useremail);
    
    RAISE NOTICE 'Added unique constraint: unique_user_credits_useremail';
  ELSE
    RAISE NOTICE 'Unique constraint already exists: unique_user_credits_useremail';
  END IF;
END $$;

-- ============================================
-- 4. ตรวจสอบ Constraints ที่สร้างแล้ว
-- ============================================

SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('credit_transactions', 'user_credits', 'credit_usage_log')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ============================================
-- หมายเหตุ:
-- - Foreign key constraints: ป้องกันการ insert ข้อมูลที่ useremail ไม่มีอยู่ใน users
-- - Check constraints: ป้องกันข้อมูลที่ไม่ถูกต้อง (เช่น amount <= 0)
-- - Unique constraints: ป้องกันการมี user_credits หลาย records สำหรับ user เดียวกัน
-- - Constraints เหล่านี้จะทำงานแม้ว่าจะปิด RLS แล้ว
-- ============================================
