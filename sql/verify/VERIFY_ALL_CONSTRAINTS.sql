-- ============================================
-- ตรวจสอบ Constraints ทั้งหมดที่สร้างแล้ว
-- ============================================

-- 1. Foreign Key Constraints
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('credit_transactions', 'user_credits', 'credit_usage_log')
AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name;

-- 2. Check Constraints
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
  AND tc.table_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('credit_transactions', 'user_credits', 'credit_usage_log')
AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- 3. Unique Constraints
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
AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, tc.constraint_name;

-- 4. Primary Key Constraints
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
AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name, tc.constraint_name;

-- 5. สรุป Constraints ทั้งหมด
SELECT 
  tc.table_name,
  tc.constraint_type,
  COUNT(*) as constraint_count
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('credit_transactions', 'user_credits', 'credit_usage_log')
GROUP BY tc.table_name, tc.constraint_type
ORDER BY tc.table_name, tc.constraint_type;
