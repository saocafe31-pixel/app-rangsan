-- ============================================
-- Purchase Orders & Items Tables Creation
-- ============================================

-- Step 1: Drop existing tables if needed (uncomment if you want to recreate)
-- DROP TABLE IF EXISTS po_items CASCADE;
-- DROP TABLE IF EXISTS purchase_orders CASCADE;

-- Step 2: Create purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  poid TEXT NOT NULL UNIQUE,
  supplier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'รออนุมัติ',
  totalamount NUMERIC DEFAULT 0,
  createddate TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  createdby TEXT NOT NULL,
  expecteddate TIMESTAMP WITH TIME ZONE,
  receiveddate TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  branchid TEXT, -- สำหรับ franchise PO
  isfranchise BOOLEAN DEFAULT FALSE,
  updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Create po_items table (without foreign key first)
CREATE TABLE IF NOT EXISTS po_items (
  id BIGSERIAL PRIMARY KEY,
  poid TEXT NOT NULL,
  productid TEXT NOT NULL,
  productname TEXT NOT NULL,
  qtyordered INTEGER NOT NULL DEFAULT 0,
  priceperunit NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Add foreign key constraint (only if it doesn't exist)
DO $$
BEGIN
  -- Check if foreign key constraint already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'po_items_poid_fkey'
    AND conrelid = 'po_items'::regclass
  ) THEN
    -- Add foreign key constraint
    ALTER TABLE po_items 
    ADD CONSTRAINT po_items_poid_fkey 
    FOREIGN KEY (poid) 
    REFERENCES purchase_orders(poid) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS idx_po_poid ON purchase_orders(poid);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_createdby ON purchase_orders(createdby);
CREATE INDEX IF NOT EXISTS idx_po_branchid ON purchase_orders(branchid);
CREATE INDEX IF NOT EXISTS idx_po_items_poid ON po_items(poid);
CREATE INDEX IF NOT EXISTS idx_po_items_productid ON po_items(productid);

-- Step 6: Disable RLS for now (using custom auth)
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE po_items DISABLE ROW LEVEL SECURITY;

-- Step 7: Add comments
COMMENT ON TABLE purchase_orders IS 'ตาราง Purchase Orders';
COMMENT ON COLUMN purchase_orders.status IS 'สถานะ: รออนุมัติ, อนุมัติแล้ว, รับแล้ว, ยกเลิก';
COMMENT ON COLUMN purchase_orders.isfranchise IS 'เป็น PO ของ franchise หรือไม่';
COMMENT ON TABLE po_items IS 'รายการสินค้าใน PO';
