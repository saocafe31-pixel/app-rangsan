-- รันครั้งเดียวบน Supabase SQL Editor ถ้า DB ยังมี trigger หักเครดิตตอน INSERT order
-- (เหมือนไฟล์ supabase/migrations/20260325120000_drop_duplicate_credit_deduct_trigger.sql)

DROP TRIGGER IF EXISTS trigger_deduct_credit_on_order ON "order";
DROP FUNCTION IF EXISTS deduct_credit_on_order();
