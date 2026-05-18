-- ปิด RLS ตาราง other_supplier_products ให้เหมือนตารางอื่น (UNRESTRICTED)
-- และเพิ่มการตรวจสอบทางเลือก: audit log ใน DB + ฝั่งแอปบังคับต้องล็อกอิน
-- รันใน Supabase Dashboard → SQL Editor

-- ========== 1) ปิด RLS ==========
ALTER TABLE public.other_supplier_products DISABLE ROW LEVEL SECURITY;

-- (ถ้ามี policy อยู่แล้ว จะยังอยู่แต่ไม่มีผลเมื่อ RLS ปิด; ต้องการลบให้รันส่วน 4.2 ใน other_supplier_products_RLS_fix.sql ก่อนแล้วค่อยปิด RLS)

-- ========== 2) ตาราง audit (เลือกทำ) ==========
-- บันทึกว่าใคร แก้ไข/เพิ่ม/ลบ เมื่อไหร่ (auth.uid() ได้เมื่อ request มาจากแอปที่ล็อกอิน)
CREATE TABLE IF NOT EXISTS public.other_supplier_products_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  op text NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  user_id uuid,      -- auth.uid() จาก JWT (null ถ้าแก้จาก Dashboard)
  productid text,
  productname text,
  changed_fields text -- สำหรับ UPDATE: เก็บชื่อคอลัมน์ที่เปลี่ยน (เช่น image, price, unit)
);

-- เปิด RLS ให้ตาราง audit อ่านได้เฉพาะแอดมิน/หรือปิด RLS ตามสไตล์โปรเจกต์
ALTER TABLE public.other_supplier_products_audit DISABLE ROW LEVEL SECURITY;

-- ========== 3) ฟังก์ชัน + trigger สำหรับ audit ==========
CREATE OR REPLACE FUNCTION public.other_supplier_products_audit_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed text := '';
  uid uuid;
BEGIN
  uid := auth.uid();  -- จาก JWT เมื่อ request มาจากแอป (ถ้าแก้จาก Dashboard จะเป็น null)

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.other_supplier_products_audit (op, user_id, productid, productname, changed_fields)
    VALUES ('INSERT', uid, NEW.productid, NEW.productname, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.other_supplier_products_audit (op, user_id, productid, productname, changed_fields)
    VALUES ('DELETE', uid, OLD.productid, OLD.productname, NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.image IS DISTINCT FROM NEW.image THEN changed := changed || 'image,'; END IF;
    IF OLD.supplier IS DISTINCT FROM NEW.supplier THEN changed := changed || 'supplier,'; END IF;
    IF OLD.price IS DISTINCT FROM NEW.price THEN changed := changed || 'price,'; END IF;
    IF OLD.unit IS DISTINCT FROM NEW.unit THEN changed := changed || 'unit,'; END IF;
    IF OLD.productname IS DISTINCT FROM NEW.productname THEN changed := changed || 'productname,'; END IF;
    IF changed <> '' THEN changed := rtrim(changed, ','); END IF;
    INSERT INTO public.other_supplier_products_audit (op, user_id, productid, productname, changed_fields)
    VALUES ('UPDATE', uid, NEW.productid, NEW.productname, NULLIF(changed, ''));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS other_supplier_products_audit_trigger ON public.other_supplier_products;
CREATE TRIGGER other_supplier_products_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.other_supplier_products
  FOR EACH ROW
  EXECUTE FUNCTION public.other_supplier_products_audit_fn();

-- สิ้นสุดสคริปต์
-- ฝั่งแอป: หน้าแก้ไข/เพิ่มสินค้าซัพนอกเข้าได้เฉพาะ user ที่เป็น franchise (App.jsx)
-- และ service บังคับต้องมี session ก่อน update/create (otherSupplierProductsService.js)
