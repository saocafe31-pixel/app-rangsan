-- แก้ RLS ตาราง other_supplier_products ให้ authenticated อัปเดตและเพิ่มรายการได้
-- รันใน Supabase Dashboard → SQL Editor แล้วกด Run

-- 1) เพิ่มคอลัมน์ถ้ายังไม่มี (ปลอดภัยรันซ้ำ)
ALTER TABLE public.other_supplier_products
  ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE public.other_supplier_products
  ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE public.other_supplier_products
  ADD COLUMN IF NOT EXISTS unit text;

-- 2) ลบ policy เดิมถ้ามี (กัน error ชื่อซ้ำ)
DROP POLICY IF EXISTS "Allow authenticated insert other_supplier_products" ON public.other_supplier_products;
DROP POLICY IF EXISTS "Allow authenticated update other_supplier_products" ON public.other_supplier_products;

-- 3) สร้าง policy ให้ผู้ใช้ที่ login (authenticated) INSERT และ UPDATE ได้
CREATE POLICY "Allow authenticated insert other_supplier_products"
  ON public.other_supplier_products
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update other_supplier_products"
  ON public.other_supplier_products
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4) เปิด RLS กลับ (รันส่วนนี้หลังทดสอบปิด RLS แล้วบันทึกได้แล้ว)
-- -----------------------------------------------
-- รันบล็อกด้านล่างใน SQL Editor เพื่อเปิด RLS และตั้ง policy ใหม่ทั้งหมด
-- -----------------------------------------------

-- 4.1 เปิด RLS
ALTER TABLE public.other_supplier_products ENABLE ROW LEVEL SECURITY;

-- 4.2 ลบ policy ทั้งหมดบนตารางนี้ (กัน policy อื่นมาขัด)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'other_supplier_products') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.other_supplier_products', r.policyname);
  END LOOP;
END $$;

-- 4.3 สร้าง policy: authenticated และ anon (แอปบางครั้งส่ง request เป็น anon แม้ล็อกอินแล้ว)
CREATE POLICY "osp_select_authenticated"
  ON public.other_supplier_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "osp_insert_authenticated"
  ON public.other_supplier_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "osp_update_authenticated"
  ON public.other_supplier_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "osp_select_anon"
  ON public.other_supplier_products FOR SELECT TO anon USING (true);
CREATE POLICY "osp_insert_anon"
  ON public.other_supplier_products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "osp_update_anon"
  ON public.other_supplier_products FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ถ้าต้องการให้เฉพาะคนล็อกอินเท่านั้นที่แก้ได้: ลบ policy ชื่อ osp_*_anon ออก
