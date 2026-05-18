-- เพิ่มคอลัมน์ OrderStep (ขั้นตอนการสั่ง) ในตาราง products
-- ค่าเริ่มต้น 1 = สั่งได้ทีละ 1 หน่วย
-- ถ้าตั้งเป็น 1000 = สั่งได้ทีละ 1000 หน่วย (เช่น แก้ว 1 ลัง = 1000 ใบ)
-- ใช้เฉพาะตอนสั่งซื้อ; หน้าจัดการสต็อกยังเบิก/ตัดทีละ 1 ได้

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS "OrderStep" integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN products."OrderStep" IS 'ขั้นตอนการสั่ง (หน่วย): สั่งซื้อได้ทีละ OrderStep หน่วย (เช่น 1000 = สั่งทีละ 1000)';
