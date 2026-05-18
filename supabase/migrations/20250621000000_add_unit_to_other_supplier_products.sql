-- เพิ่มคอลัมน์ unit (หน่วยสินค้า) ใน other_supplier_products
ALTER TABLE public.other_supplier_products
  ADD COLUMN IF NOT EXISTS unit text;

COMMENT ON COLUMN public.other_supplier_products.unit IS 'หน่วยสินค้า เช่น ชิ้น, ถุง, กล่อง';

-- อนุญาตให้ authenticated อัปเดตและเพิ่มรายการได้ (สำหรับปุ่มแก้ไข/เพิ่มสินค้าในหน้าสั่งสินค้าซัพอื่น)
CREATE POLICY "Allow authenticated insert other_supplier_products" ON public.other_supplier_products
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update other_supplier_products" ON public.other_supplier_products
  FOR UPDATE TO authenticated USING (true);
