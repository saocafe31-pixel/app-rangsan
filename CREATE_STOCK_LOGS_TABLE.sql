-- Create stock_logs table for tracking stock movements
CREATE TABLE IF NOT EXISTS stock_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  productid TEXT NOT NULL,
  productname TEXT NOT NULL,
  type TEXT NOT NULL, -- 'IN', 'OUT', 'ADD', 'EDIT', 'ADJUST'
  quantity INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0, -- Stock balance after this transaction
  note TEXT,
  useremail TEXT,
  poid TEXT, -- Reference to PO if from PO
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stock_logs_productid ON stock_logs(productid);
CREATE INDEX IF NOT EXISTS idx_stock_logs_timestamp ON stock_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_stock_logs_poid ON stock_logs(poid);
CREATE INDEX IF NOT EXISTS idx_stock_logs_type ON stock_logs(type);

-- Disable RLS for now (using custom auth)
ALTER TABLE stock_logs DISABLE ROW LEVEL SECURITY;

-- Add comments
COMMENT ON TABLE stock_logs IS 'ตาราง Stock Log สำหรับติดตามการเคลื่อนไหวสต็อก';
COMMENT ON COLUMN stock_logs.type IS 'ประเภท: IN (รับเข้า), OUT (เบิกออก), ADD (เพิ่มใหม่), EDIT (แก้ไข), ADJUST (ปรับปรุง)';
COMMENT ON COLUMN stock_logs.balance IS 'ยอดคงเหลือหลังจากการทำรายการนี้';
