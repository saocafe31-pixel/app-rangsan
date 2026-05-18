-- เพิ่มคอลัมน์ slipurl ใน credit_usage_log สำหรับเก็บลิงก์สลิปการเติมเครดิตโดยแอดมิน
ALTER TABLE credit_usage_log
  ADD COLUMN IF NOT EXISTS slipurl TEXT;
