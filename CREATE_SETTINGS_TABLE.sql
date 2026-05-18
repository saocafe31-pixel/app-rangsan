-- ============================================
-- สร้างตาราง settings สำหรับเก็บการตั้งค่า
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- สร้าง index สำหรับ key
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- เพิ่มข้อมูลเริ่มต้น
INSERT INTO settings (key, value) 
VALUES ('shipping', '{"pickupEnabled": true, "deliveryEnabled": true}')
ON CONFLICT (key) DO NOTHING;

-- ปิด RLS สำหรับตาราง settings (หรือสร้าง policy ตามต้องการ)
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
