-- สร้างตาราง notifications ใน Supabase
-- Run this SQL in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  useremail TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  orderid TEXT,
  metadata JSONB,
  read BOOLEAN DEFAULT false,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- สร้าง index เพื่อเพิ่มประสิทธิภาพ
CREATE INDEX IF NOT EXISTS idx_notifications_useremail ON notifications(useremail);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_createdat ON notifications(createdat DESC);

-- ปิด RLS สำหรับ notifications table (เพราะใช้ custom authentication)
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- หรือถ้าต้องการเปิด RLS ให้ใช้ policy นี้:
-- CREATE POLICY "Users can view their own notifications" ON notifications
--   FOR SELECT USING (useremail = current_setting('app.user_email', true));
-- 
-- CREATE POLICY "Users can update their own notifications" ON notifications
--   FOR UPDATE USING (useremail = current_setting('app.user_email', true));
