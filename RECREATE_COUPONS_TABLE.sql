-- ============================================
-- สร้างตาราง coupons ใหม่ให้ตรงกับโครงสร้างที่ใช้ในโค้ด
-- ============================================
-- 
-- หมายเหตุ: ใช้ double quotes ("Code", "Type", etc.) เพื่อให้ column names เป็น case-sensitive (PascalCase)
-- ซึ่งจะตรงกับที่โค้ด JavaScript ใช้ (Code, Type, Value, Status, MinPurchase, MaxDiscount, UsageLimit, ValidFrom, ValidUntil, Description)
--
-- หลังจากรัน script นี้แล้ว:
-- 1. ตาราง coupons จะถูกสร้างใหม่พร้อมโครงสร้างที่ถูกต้อง
-- 2. Column names จะเป็น PascalCase (Code, Type, Value, etc.)
-- 3. Primary key คือ 'id' (lowercase) สำหรับการลบ/แก้ไข
-- 4. RLS ถูกปิดไว้แล้ว (เนื่องจากใช้ custom authentication)
--
-- ============================================

-- Step 1: ลบตาราง coupons เดิม (ถ้ามี)
-- ⚠️ คำเตือน: การรัน script นี้จะลบข้อมูลคูปองเดิมทั้งหมด
-- หากต้องการเก็บข้อมูลเดิม ให้ export ข้อมูลก่อนรัน script นี้
DROP TABLE IF EXISTS coupons CASCADE;

-- Step 2: สร้างตาราง coupons ใหม่
-- ใช้ double quotes เพื่อให้ column names เป็น case-sensitive (PascalCase)
CREATE TABLE coupons (
  id BIGSERIAL PRIMARY KEY,
  "Code" TEXT NOT NULL UNIQUE,
  "Type" TEXT NOT NULL DEFAULT 'fixed', -- 'fixed' หรือ 'percentage'
  "Value" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "Status" TEXT NOT NULL DEFAULT 'active', -- 'active' หรือ 'inactive'
  "MinPurchase" NUMERIC(10, 2) DEFAULT 0, -- ยอดซื้อขั้นต่ำ (บาท)
  "MaxDiscount" NUMERIC(10, 2) DEFAULT 0, -- ส่วนลดสูงสุด (บาท) สำหรับ percentage (0 = ไม่จำกัด)
  "UsageLimit" INTEGER DEFAULT 0, -- จำนวนครั้งที่ใช้ได้ต่อคน (0 = ไม่จำกัด)
  "UsageCount" INTEGER DEFAULT 0, -- จำนวนครั้งที่ใช้ไปแล้วทั้งหมด
  "ValidFrom" TIMESTAMP WITH TIME ZONE, -- วันที่เริ่มต้น
  "ValidUntil" TIMESTAMP WITH TIME ZONE, -- วันที่สิ้นสุด
  "Description" TEXT, -- รายละเอียดคูปอง
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: สร้าง Indexes เพื่อเพิ่มประสิทธิภาพ
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons("Code");
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons("Status");
CREATE INDEX IF NOT EXISTS idx_coupons_valid_from ON coupons("ValidFrom");
CREATE INDEX IF NOT EXISTS idx_coupons_valid_until ON coupons("ValidUntil");

-- Step 4: เพิ่ม Comments เพื่ออธิบายตารางและคอลัมน์
COMMENT ON TABLE coupons IS 'ตารางเก็บข้อมูลคูปอง/โค้ดส่วนลด';
COMMENT ON COLUMN coupons.id IS 'Primary Key';
COMMENT ON COLUMN coupons."Code" IS 'โค้ดคูปอง (ต้องไม่ซ้ำ)';
COMMENT ON COLUMN coupons."Type" IS 'ประเภทส่วนลด: fixed (จำนวนเงิน) หรือ percentage (เปอร์เซ็นต์)';
COMMENT ON COLUMN coupons."Value" IS 'มูลค่าส่วนลด (ถ้า Type = fixed เป็นจำนวนเงิน, ถ้า Type = percentage เป็นเปอร์เซ็นต์)';
COMMENT ON COLUMN coupons."Status" IS 'สถานะ: active (ใช้งาน) หรือ inactive (ปิดใช้งาน)';
COMMENT ON COLUMN coupons."MinPurchase" IS 'ยอดซื้อขั้นต่ำที่ต้องซื้อก่อนใช้คูปอง (บาท, 0 = ไม่จำกัด)';
COMMENT ON COLUMN coupons."MaxDiscount" IS 'ส่วนลดสูงสุดสำหรับ Type = percentage (บาท, 0 = ไม่จำกัด)';
COMMENT ON COLUMN coupons."UsageLimit" IS 'จำนวนครั้งที่ใช้ได้ต่อคน (0 = ไม่จำกัด)';
COMMENT ON COLUMN coupons."UsageCount" IS 'จำนวนครั้งที่ใช้ไปแล้วทั้งหมด';
COMMENT ON COLUMN coupons."ValidFrom" IS 'วันที่เริ่มต้นที่คูปองสามารถใช้ได้';
COMMENT ON COLUMN coupons."ValidUntil" IS 'วันที่สิ้นสุดที่คูปองสามารถใช้ได้';
COMMENT ON COLUMN coupons."Description" IS 'รายละเอียดหรือคำอธิบายคูปอง';
COMMENT ON COLUMN coupons.createdat IS 'วันที่และเวลาที่สร้างคูปอง';
COMMENT ON COLUMN coupons.updatedat IS 'วันที่และเวลาที่อัปเดตคูปองล่าสุด';

-- Step 5: สร้าง Trigger เพื่ออัปเดต updatedat อัตโนมัติ
CREATE OR REPLACE FUNCTION update_coupons_updatedat()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_coupons_updatedat
  BEFORE UPDATE ON coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_coupons_updatedat();

-- Step 6: เพิ่ม Check Constraints เพื่อตรวจสอบข้อมูล
ALTER TABLE coupons
  ADD CONSTRAINT chk_coupons_type CHECK ("Type" IN ('fixed', 'percentage'));
  
ALTER TABLE coupons
  ADD CONSTRAINT chk_coupons_status CHECK ("Status" IN ('active', 'inactive'));
  
ALTER TABLE coupons
  ADD CONSTRAINT chk_coupons_value CHECK ("Value" >= 0);
  
ALTER TABLE coupons
  ADD CONSTRAINT chk_coupons_min_purchase CHECK ("MinPurchase" >= 0);
  
ALTER TABLE coupons
  ADD CONSTRAINT chk_coupons_max_discount CHECK ("MaxDiscount" >= 0);
  
ALTER TABLE coupons
  ADD CONSTRAINT chk_coupons_usage_limit CHECK ("UsageLimit" >= 0);
  
ALTER TABLE coupons
  ADD CONSTRAINT chk_coupons_percentage_value CHECK (
    ("Type" = 'percentage' AND "Value" <= 100) OR 
    ("Type" = 'fixed')
  );

-- Step 7: ปิด RLS (Row Level Security) สำหรับตารางนี้ (เนื่องจากใช้ custom authentication)
ALTER TABLE coupons DISABLE ROW LEVEL SECURITY;

-- Step 8: ตรวจสอบโครงสร้างตารางที่สร้างแล้ว
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'coupons'
ORDER BY ordinal_position;

-- ============================================
-- ตัวอย่างข้อมูลสำหรับทดสอบ (Optional)
-- ============================================
-- INSERT INTO coupons ("Code", "Type", "Value", "Status", "MinPurchase", "MaxDiscount", "UsageLimit", "Description")
-- VALUES 
--   ('RANGSAN20', 'fixed', 20.00, 'active', 0, 0, 1, 'สำหรับลูกค้าใหม่ใช้งานแอปครั้งแรก'),
--   ('DISCOUNT10', 'percentage', 10, 'active', 500, 100, 0, 'ส่วนลด 10% สูงสุด 100 บาท');
