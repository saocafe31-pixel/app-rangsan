-- เพิ่มคอลัมน์ id ในตาราง shipping_rates (สำหรับแก้ไข/ลบอัตราค่าจัดส่งในหน้ากำหนดค่าการจัดส่ง)
-- รันใน Supabase → SQL Editor เมื่อเจอ error "column shipping_rates.id does not exist"

-- ถ้ายังไม่มีตาราง shipping_rates ให้สร้างใหม่ (มี id ตั้งแต่ต้น)
CREATE TABLE IF NOT EXISTS shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "MinWeight" numeric NOT NULL DEFAULT 0,
  "MaxWeight" numeric NOT NULL DEFAULT 0,
  "Price" numeric NOT NULL DEFAULT 0
);

-- ถ้ามีตารางอยู่แล้วแต่ไม่มีคอลัมน์ id: เพิ่มคอลัมน์ id (แถวเดิมจะได้ id อัตโนมัติ)
ALTER TABLE shipping_rates
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;

-- ทำให้ id เป็น primary key (รันได้เมื่อตารางยังไม่มี primary key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'shipping_rates'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE shipping_rates ADD PRIMARY KEY (id);
  END IF;
END $$;
