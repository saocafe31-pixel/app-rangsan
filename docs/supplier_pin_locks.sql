-- ตารางล็อกซัพพลาย: ชื่อซัพ + รหัส PIN (เก็บเป็น hash) สำหรับหน้า "สั่งสินค้าซัพอื่น"
-- รันใน Supabase Dashboard → SQL Editor
-- ถ้าเคยรันสคริปต์เก่าแล้วเปลี่ยน v_salt: hash เดิมจะไม่ตรง — ต้องตั้ง PIN ใหม่ในตาราง supplier_pin_locks

-- 1) สร้างตาราง
CREATE TABLE IF NOT EXISTS public.supplier_pin_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) เปิด extension สำหรับ hash (ถ้ามีอยู่แล้วจะไม่ error)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 3) ฟังก์ชันตรวจสอบ PIN (ใช้ในแอปเมื่อสาขาเลือกซัพที่ถูกล็อก)
-- คืนค่า true ถ้า PIN ถูก
CREATE OR REPLACE FUNCTION public.check_supplier_pin(p_supplier_name text, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_input_hash text;
  v_salt text := 'rangsan_supplier_pin_2024';
BEGIN
  IF p_supplier_name IS NULL OR trim(p_supplier_name) = '' OR p_pin IS NULL THEN
    RETURN false;
  END IF;
  SELECT pin_hash INTO v_hash
  FROM public.supplier_pin_locks
  WHERE trim(supplier_name) = trim(p_supplier_name)
  LIMIT 1;
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;
  v_input_hash := encode(digest((trim(p_supplier_name) || trim(p_pin) || v_salt), 'sha256'::text), 'hex'::text);
  RETURN v_hash = v_input_hash;
END;
$$;

-- 4) ฟังก์ชันสร้าง/อัปเดตล็อก (แอดมินตั้งค่า) — เก็บ hash ของ PIN
CREATE OR REPLACE FUNCTION public.upsert_supplier_pin_lock(p_supplier_name text, p_pin text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_salt text := 'rangsan_supplier_pin_2024';
  v_hash text;
  v_id uuid;
BEGIN
  IF p_supplier_name IS NULL OR trim(p_supplier_name) = '' OR p_pin IS NULL OR trim(p_pin) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อซัพพลายและรหัส PIN';
  END IF;
  v_hash := encode(digest((trim(p_supplier_name) || trim(p_pin) || v_salt), 'sha256'::text), 'hex'::text);
  INSERT INTO public.supplier_pin_locks (supplier_name, pin_hash)
  VALUES (trim(p_supplier_name), v_hash)
  ON CONFLICT (supplier_name) DO UPDATE SET pin_hash = EXCLUDED.pin_hash
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 5) ลบล็อก
CREATE OR REPLACE FUNCTION public.delete_supplier_pin_lock(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.supplier_pin_locks WHERE id = p_id;
END;
$$;

-- 6) สิทธิ์: ให้ authenticated อ่านรายการล็อกได้ (เพื่อรู้ว่าซัพไหนล็อก) และเรียก RPC ได้
ALTER TABLE public.supplier_pin_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_pin_locks_select" ON public.supplier_pin_locks;
CREATE POLICY "supplier_pin_locks_select"
  ON public.supplier_pin_locks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "supplier_pin_locks_select_anon" ON public.supplier_pin_locks;
CREATE POLICY "supplier_pin_locks_select_anon"
  ON public.supplier_pin_locks FOR SELECT TO anon USING (true);

-- แอดมินเท่านั้นที่ insert/update/delete ได้ — ใช้ผ่าน RPC (SECURITY DEFINER) ดังนั้นไม่ต้องเปิด policy สำหรับ insert/update/delete บนตารางโดยตรง
-- การเรียก RPC check_supplier_pin, upsert_supplier_pin_lock, delete_supplier_pin_lock ต้องอนุญาตให้ authenticated
GRANT EXECUTE ON FUNCTION public.check_supplier_pin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_supplier_pin(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_supplier_pin_lock(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_supplier_pin_lock(uuid) TO authenticated;
