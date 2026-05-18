-- ตารางรายการสินค้าซัพนอก (other_supplier_products)
-- ใช้เป็นรายการสินค้าเบื้องต้นที่แต่ละสาขาสามารถดึงมาเพิ่มเข้าสต็อกได้
CREATE TABLE IF NOT EXISTS public.other_supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  productid text NOT NULL UNIQUE,
  productname text NOT NULL,
  stock numeric NOT NULL DEFAULT 0,
  minstock numeric NOT NULL DEFAULT 5,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.other_supplier_products IS 'รายการสินค้าซัพนอก - รายการเบื้องต้นที่สาขาเลือกเพิ่มเข้า franchise_stock ได้';
COMMENT ON COLUMN public.other_supplier_products.productid IS 'รหัสสินค้า (ไม่ซ้ำ)';
COMMENT ON COLUMN public.other_supplier_products.productname IS 'ชื่อสินค้า';
COMMENT ON COLUMN public.other_supplier_products.stock IS 'จำนวนสต็อกต้นทาง (default 0)';
COMMENT ON COLUMN public.other_supplier_products.minstock IS 'สต็อกขั้นต่ำ (default 5)';
COMMENT ON COLUMN public.other_supplier_products.price IS 'ราคา';

-- เปิด RLS แล้วอนุญาตให้อ่านได้ (แฟรนไชส์ดึงรายการ), แอดมินหรือ service role เขียนได้
ALTER TABLE public.other_supplier_products ENABLE ROW LEVEL SECURITY;

-- นโยบาย: ให้อ่านได้ (สาขาใช้ดึงรายการเพื่อเลือกเพิ่มสต็อก)
CREATE POLICY "Allow read for authenticated" ON public.other_supplier_products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read for anon" ON public.other_supplier_products
  FOR SELECT TO anon USING (true);

-- แอดมินจัดการรายการผ่าน Supabase Table Editor หรือเพิ่ม policy สำหรับ role admin ภายหลัง
