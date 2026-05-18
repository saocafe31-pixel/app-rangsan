-- Create franchise_stock table for managing stock per branch
CREATE TABLE IF NOT EXISTS franchise_stock (
  id BIGSERIAL PRIMARY KEY,
  productid TEXT NOT NULL,
  branchid TEXT NOT NULL,
  productname TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  minstock INTEGER NOT NULL DEFAULT 5,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(productid, branchid)
);

-- Create franchise_stock_logs table for tracking stock movements
CREATE TABLE IF NOT EXISTS franchise_stock_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  productid TEXT NOT NULL,
  productname TEXT NOT NULL,
  branchid TEXT NOT NULL,
  type TEXT NOT NULL, -- 'IN', 'OUT', 'ADJUST', 'FROM_ORDER', 'FROM_PO'
  quantity INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0, -- Stock balance after this transaction
  note TEXT,
  useremail TEXT,
  orderid TEXT, -- Reference to order if from order
  poid TEXT, -- Reference to PO if from PO
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_franchise_stock_productid ON franchise_stock(productid);
CREATE INDEX IF NOT EXISTS idx_franchise_stock_branchid ON franchise_stock(branchid);
CREATE INDEX IF NOT EXISTS idx_franchise_stock_logs_productid ON franchise_stock_logs(productid);
CREATE INDEX IF NOT EXISTS idx_franchise_stock_logs_branchid ON franchise_stock_logs(branchid);
CREATE INDEX IF NOT EXISTS idx_franchise_stock_logs_timestamp ON franchise_stock_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_franchise_stock_logs_type ON franchise_stock_logs(type);
CREATE INDEX IF NOT EXISTS idx_franchise_stock_logs_orderid ON franchise_stock_logs(orderid);
CREATE INDEX IF NOT EXISTS idx_franchise_stock_logs_poid ON franchise_stock_logs(poid);

-- Disable RLS for now (using custom auth)
ALTER TABLE franchise_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE franchise_stock_logs DISABLE ROW LEVEL SECURITY;

-- Add comments
COMMENT ON TABLE franchise_stock IS 'ตารางสต็อกสินค้าของแต่ละสาขาแฟรนไชส์';
COMMENT ON TABLE franchise_stock_logs IS 'ตารางประวัติการเคลื่อนไหวสต็อกของแฟรนไชส์';
COMMENT ON COLUMN franchise_stock_logs.type IS 'ประเภท: IN (รับเข้า), OUT (เบิกออก), ADJUST (ปรับปรุง), FROM_ORDER (จากออเดอร์), FROM_PO (จาก PO)';
