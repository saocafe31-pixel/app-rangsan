-- รันใน Supabase SQL Editor (หรือใช้ migration ใน supabase/migrations/)
-- ประตูเข้าหน้าจัดการผู้ใช้งาน (แอดมิน): ตรวจชื่อ + รหัสผ่าน RPC เท่านั้น — ไม่เปิด SELECT ตารางให้ client
-- เพิ่มแถวด้วยตนเอง:
-- INSERT INTO admin_user_mgmt_access (verifier_name, confirmation_code) VALUES ('ชื่อผู้ดูแล', 'รหัสลับของคุณ');

CREATE TABLE IF NOT EXISTS admin_user_mgmt_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_name text NOT NULL,
  confirmation_code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_user_mgmt_access_unique_pair UNIQUE (verifier_name, confirmation_code)
);

COMMENT ON TABLE admin_user_mgmt_access IS 'คู่ชื่อ+รหัสสำหรับปลดล็อกหน้าจัดการผู้ใช้งานแอดมิน (เรียกผ่าน verify_admin_user_mgmt_access เท่านั้น)';

ALTER TABLE admin_user_mgmt_access ENABLE ROW LEVEL SECURITY;

-- ไม่มีนโยบาย SELECT สำหรับบทบาท client — ป้องกันการดึงรหัสจากตาราง

CREATE OR REPLACE FUNCTION public.verify_admin_user_mgmt_access(p_name text, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' OR p_code IS NULL OR trim(p_code) = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM admin_user_mgmt_access
    WHERE is_active = true
      AND lower(trim(verifier_name)) = lower(trim(p_name))
      AND confirmation_code = trim(p_code)
  );
END;
$$;

COMMENT ON FUNCTION public.verify_admin_user_mgmt_access(text, text) IS 'คืน true ถ้ามีคู่ชื่อ+รหัสที่ active (ใช้ปลดล็อกหน้าแอดมิน)';

GRANT EXECUTE ON FUNCTION public.verify_admin_user_mgmt_access(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_user_mgmt_access(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_user_mgmt_access(text, text) TO service_role;
