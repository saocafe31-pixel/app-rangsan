-- ============================================
-- ตรวจสอบ Email ซ้ำกันในตาราง users
-- ============================================
-- 
-- Script นี้จะแสดง email ที่ซ้ำกันในตาราง users
-- ต้องลบ email ซ้ำกันก่อนสร้าง unique constraint
-- ============================================

-- แสดง email ที่ซ้ำกัน
SELECT 
  "Email",
  COUNT(*) as count,
  STRING_AGG("Username", ', ') as usernames,
  STRING_AGG(CAST(id AS TEXT), ', ') as ids
FROM users
WHERE "Email" IS NOT NULL
GROUP BY "Email"
HAVING COUNT(*) > 1
ORDER BY count DESC, "Email";

-- ============================================
-- หมายเหตุ:
-- - ถ้ามี email ซ้ำกัน ต้องลบหรือแก้ไขก่อนสร้าง unique constraint
-- - ใช้ script นี้เพื่อตรวจสอบก่อนรัน ADD_UNIQUE_EMAIL_CONSTRAINT.sql
-- ============================================
