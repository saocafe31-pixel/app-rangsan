-- ============================================
-- สร้างตาราง promotions สำหรับจัดการโปรโมชั่น
-- ============================================
-- 
-- ประเภทโปรโมชั่น:
-- 1. buy_x_get_y: ซื้อ X แถม Y (เช่น ซื้อ 10 แถม 1)
-- 2. discount_percentage: ส่วนลดเปอร์เซ็นต์ (เช่น ลด 10%)
-- 3. discount_fixed: ส่วนลดจำนวนเงิน (เช่น ลด 50 บาท)
--
-- ============================================

-- Step 1: ลบตาราง promotions เดิม (ถ้ามี)
DROP TABLE IF EXISTS promotions CASCADE;

-- Step 2: สร้างตาราง promotions ใหม่
CREATE TABLE promotions (
  id BIGSERIAL PRIMARY KEY,
  "Name" TEXT NOT NULL, -- ชื่อโปรโมชั่น
  "Type" TEXT NOT NULL, -- ประเภท: 'buy_x_get_y', 'discount_percentage', 'discount_fixed'
  "ProductID" TEXT NOT NULL, -- รหัสสินค้าที่ใช้โปรโมชั่น
  "GetProductID" TEXT, -- รหัสสินค้าที่ได้เพิ่ม (สินค้า Y สำหรับ buy_x_get_y, NULL = สินค้าเดียวกัน)
  "BuyQuantity" INTEGER DEFAULT 0, -- จำนวนที่ต้องซื้อ (สำหรับ buy_x_get_y)
  "GetQuantity" INTEGER DEFAULT 0, -- จำนวนที่ได้เพิ่ม (สำหรับ buy_x_get_y)
  "DiscountPercentage" NUMERIC(5, 2) DEFAULT 0, -- เปอร์เซ็นต์ส่วนลด (สำหรับ discount_percentage)
  "DiscountAmount" NUMERIC(10, 2) DEFAULT 0, -- จำนวนเงินส่วนลด (สำหรับ discount_fixed)
  "MinPurchase" NUMERIC(10, 2) DEFAULT 0, -- ยอดซื้อขั้นต่ำ (บาท)
  "MaxDiscount" NUMERIC(10, 2) DEFAULT 0, -- ส่วนลดสูงสุด (สำหรับ discount_percentage)
  "ValidFrom" TIMESTAMP WITH TIME ZONE, -- วันที่เริ่มต้น
  "ValidUntil" TIMESTAMP WITH TIME ZONE, -- วันที่สิ้นสุด
  "Status" TEXT NOT NULL DEFAULT 'active', -- 'active' หรือ 'inactive'
  "Description" TEXT, -- รายละเอียดโปรโมชั่น
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: สร้าง Indexes เพื่อเพิ่มประสิทธิภาพ
CREATE INDEX IF NOT EXISTS idx_promotions_productid ON promotions("ProductID");
CREATE INDEX IF NOT EXISTS idx_promotions_type ON promotions("Type");
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions("Status");
CREATE INDEX IF NOT EXISTS idx_promotions_validfrom ON promotions("ValidFrom");
CREATE INDEX IF NOT EXISTS idx_promotions_validuntil ON promotions("ValidUntil");

-- Step 4: เพิ่ม Comments เพื่ออธิบายตารางและคอลัมน์
COMMENT ON TABLE promotions IS 'ตารางเก็บข้อมูลโปรโมชั่น';
COMMENT ON COLUMN promotions.id IS 'Primary Key';
COMMENT ON COLUMN promotions."Name" IS 'ชื่อโปรโมชั่น';
COMMENT ON COLUMN promotions."Type" IS 'ประเภท: buy_x_get_y (ซื้อ X แถม Y), discount_percentage (ส่วนลดเปอร์เซ็นต์), discount_fixed (ส่วนลดจำนวนเงิน)';
COMMENT ON COLUMN promotions."ProductID" IS 'รหัสสินค้าที่ใช้โปรโมชั่น (สินค้า X สำหรับ buy_x_get_y)';
COMMENT ON COLUMN promotions."GetProductID" IS 'รหัสสินค้าที่ได้เพิ่ม (สินค้า Y สำหรับ buy_x_get_y, NULL = สินค้าเดียวกัน)';
COMMENT ON COLUMN promotions."BuyQuantity" IS 'จำนวนที่ต้องซื้อ (สำหรับ buy_x_get_y)';
COMMENT ON COLUMN promotions."GetQuantity" IS 'จำนวนที่ได้เพิ่ม (สำหรับ buy_x_get_y)';
COMMENT ON COLUMN promotions."DiscountPercentage" IS 'เปอร์เซ็นต์ส่วนลด (สำหรับ discount_percentage)';
COMMENT ON COLUMN promotions."DiscountAmount" IS 'จำนวนเงินส่วนลด (สำหรับ discount_fixed)';
COMMENT ON COLUMN promotions."MinPurchase" IS 'ยอดซื้อขั้นต่ำที่ต้องซื้อก่อนใช้โปรโมชั่น (บาท)';
COMMENT ON COLUMN promotions."MaxDiscount" IS 'ส่วนลดสูงสุดสำหรับ discount_percentage (บาท)';
COMMENT ON COLUMN promotions."ValidFrom" IS 'วันที่เริ่มต้นที่โปรโมชั่นสามารถใช้ได้';
COMMENT ON COLUMN promotions."ValidUntil" IS 'วันที่สิ้นสุดที่โปรโมชั่นสามารถใช้ได้';
COMMENT ON COLUMN promotions."Status" IS 'สถานะ: active (ใช้งาน), inactive (ปิดใช้งาน)';
COMMENT ON COLUMN promotions."Description" IS 'รายละเอียดโปรโมชั่น';
COMMENT ON COLUMN promotions.createdat IS 'วันที่และเวลาที่สร้างโปรโมชั่น';
COMMENT ON COLUMN promotions.updatedat IS 'วันที่และเวลาที่อัปเดตโปรโมชั่นล่าสุด';

-- Step 5: สร้าง Trigger เพื่ออัปเดต updatedat อัตโนมัติ
CREATE OR REPLACE FUNCTION update_promotions_updatedat()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_promotions_updatedat
  BEFORE UPDATE ON promotions
  FOR EACH ROW
  EXECUTE FUNCTION update_promotions_updatedat();

-- Step 6: เพิ่ม Check Constraints เพื่อตรวจสอบข้อมูล
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_type CHECK ("Type" IN ('buy_x_get_y', 'discount_percentage', 'discount_fixed'));
  
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_status CHECK ("Status" IN ('active', 'inactive'));
  
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_buy_quantity CHECK ("BuyQuantity" >= 0);
  
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_get_quantity CHECK ("GetQuantity" >= 0);
  
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_discount_percentage CHECK ("DiscountPercentage" >= 0 AND "DiscountPercentage" <= 100);
  
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_discount_amount CHECK ("DiscountAmount" >= 0);
  
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_min_purchase CHECK ("MinPurchase" >= 0);
  
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_max_discount CHECK ("MaxDiscount" >= 0);
  
ALTER TABLE promotions
  ADD CONSTRAINT chk_promotions_valid_dates CHECK ("ValidFrom" IS NULL OR "ValidUntil" IS NULL OR "ValidFrom" <= "ValidUntil");

-- Step 7: ปิด RLS (Row Level Security) สำหรับตารางนี้ (เนื่องจากใช้ custom authentication)
ALTER TABLE promotions DISABLE ROW LEVEL SECURITY;

-- Step 8: ตรวจสอบโครงสร้างตารางที่สร้างแล้ว
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'promotions'
ORDER BY ordinal_position;

-- ============================================
-- ตัวอย่างข้อมูลสำหรับทดสอบ (Optional)
-- ============================================
-- INSERT INTO promotions ("Name", "Type", "ProductID", "BuyQuantity", "GetQuantity", "Status", "Description")
-- VALUES 
--   ('ซื้อ 10 แถม 1', 'buy_x_get_y', 'A001', 10, 1, 'active', 'ซื้อกาแฟ 10 แถม 1'),
--   ('ส่วนลด 10%', 'discount_percentage', 'A002', 0, 0, 'active', 'ส่วนลด 10% สำหรับสินค้านี้');