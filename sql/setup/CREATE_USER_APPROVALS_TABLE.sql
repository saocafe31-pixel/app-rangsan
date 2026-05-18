-- ============================================
-- สร้างตาราง user_approvals สำหรับระบบ Admin Approval
-- ============================================
-- 
-- ตารางนี้ใช้สำหรับเก็บคำขออนุมัติ UserType จากผู้ใช้
-- Admin จะเป็นผู้อนุมัติหรือปฏิเสธคำขอ
-- ============================================

-- สร้างตาราง user_approvals
CREATE TABLE IF NOT EXISTS user_approvals (
  id BIGSERIAL PRIMARY KEY,
  useremail TEXT NOT NULL,
  requested_usertype TEXT NOT NULL DEFAULT 'franchise',
  status TEXT NOT NULL DEFAULT 'pending',
  admin_email TEXT,
  admin_notes TEXT,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewedat TIMESTAMP WITH TIME ZONE
);

-- สร้าง index เพื่อเพิ่มประสิทธิภาพ
CREATE INDEX IF NOT EXISTS idx_user_approvals_useremail ON user_approvals(useremail);
CREATE INDEX IF NOT EXISTS idx_user_approvals_status ON user_approvals(status);
CREATE INDEX IF NOT EXISTS idx_user_approvals_createdat ON user_approvals(createdat DESC);

-- เพิ่ม comment
COMMENT ON TABLE user_approvals IS 'ตารางเก็บคำขออนุมัติ UserType จากผู้ใช้';
COMMENT ON COLUMN user_approvals.useremail IS 'อีเมลผู้ใช้ที่ร้องขอ';
COMMENT ON COLUMN user_approvals.requested_usertype IS 'UserType ที่ร้องขอ (franchise/regular)';
COMMENT ON COLUMN user_approvals.status IS 'สถานะ: pending, approved, rejected';
COMMENT ON COLUMN user_approvals.admin_email IS 'อีเมล Admin ที่อนุมัติ/ปฏิเสธ';
COMMENT ON COLUMN user_approvals.admin_notes IS 'หมายเหตุจาก Admin';

-- ปิด RLS (เพราะแอปใช้ custom authentication)
ALTER TABLE user_approvals DISABLE ROW LEVEL SECURITY;

-- ============================================
-- หมายเหตุ:
-- - ตารางนี้ใช้สำหรับเก็บคำขออนุมัติ UserType
-- - Admin จะเป็นผู้อนุมัติหรือปฏิเสธคำขอ
-- - หลังจากอนุมัติแล้ว Admin จะอัพเดท UserType ในตาราง users
-- ============================================
