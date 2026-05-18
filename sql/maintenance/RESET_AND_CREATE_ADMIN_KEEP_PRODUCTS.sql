-- ============================================
-- ล้างข้อมูลทั้งหมดและสร้าง Admin User ใหม่ (รวมกัน)
-- ยกเว้นตาราง products (ข้อมูลสินค้าจะยังคงอยู่)
-- ============================================
-- 
-- ⚠️ คำเตือน: Script นี้จะลบข้อมูลทั้งหมดในทุกตาราง
-- ยกเว้นตาราง products (ข้อมูลสินค้าจะยังคงอยู่)
-- และสร้าง Admin User ใหม่ทันที
-- 
-- ใช้เมื่อต้องการรีเซ็ตฐานข้อมูลทั้งหมดและเริ่มใหม่
-- แต่ต้องการคงข้อมูลสินค้าไว้
-- ============================================

-- ============================================
-- ส่วนที่ 1: ล้างข้อมูลทั้งหมด (ยกเว้น products)
-- ============================================

-- ลบข้อมูลจากตารางที่อ้างอิง order
TRUNCATE TABLE credit_usage_log CASCADE;
TRUNCATE TABLE tax_invoices CASCADE;
TRUNCATE TABLE "order" CASCADE;

-- ลบข้อมูลจากตารางที่อ้างอิง purchase_orders
TRUNCATE TABLE po_items CASCADE;
TRUNCATE TABLE purchase_orders CASCADE;

-- ลบข้อมูลจากตารางที่อ้างอิง users
TRUNCATE TABLE notifications CASCADE;
TRUNCATE TABLE credit_transactions CASCADE;
TRUNCATE TABLE user_credits CASCADE;
TRUNCATE TABLE user_approvals CASCADE;
TRUNCATE TABLE franchise_stock_logs CASCADE;
TRUNCATE TABLE franchise_stock CASCADE;

-- ลบข้อมูลจากตารางที่อ้างอิง products
-- หมายเหตุ: ไม่ลบข้อมูลจาก stock_logs เพราะอาจมีข้อมูลสำคัญ
-- TRUNCATE TABLE stock_logs CASCADE;

-- ลบข้อมูลจากตารางหลัก
TRUNCATE TABLE users CASCADE;
-- ⚠️ หมายเหตุ: ไม่ลบข้อมูลจาก products เพราะต้องการคงข้อมูลสินค้าไว้
-- TRUNCATE TABLE products CASCADE;

-- ลบข้อมูลจากตารางอื่นๆ (ถ้ามี)
-- ใช้ DO block เพื่อตรวจสอบว่าตารางมีอยู่จริงก่อน TRUNCATE
DO $$
BEGIN
  -- TRUNCATE coupons (ถ้ามี)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coupons') THEN
    EXECUTE 'TRUNCATE TABLE coupons CASCADE';
  END IF;
  
  -- TRUNCATE shipping_rates (ถ้ามี)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipping_rates') THEN
    EXECUTE 'TRUNCATE TABLE shipping_rates CASCADE';
  END IF;
  
  -- TRUNCATE settings (ถ้ามี)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    EXECUTE 'TRUNCATE TABLE settings CASCADE';
  END IF;
  
  -- TRUNCATE suppliers (ถ้ามี)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
    EXECUTE 'TRUNCATE TABLE suppliers CASCADE';
  END IF;
END $$;

-- ============================================
-- ส่วนที่ 2: Reset Sequences
-- ============================================

-- Reset sequence สำหรับ user_approvals
ALTER SEQUENCE IF EXISTS user_approvals_id_seq RESTART WITH 1;

-- Reset sequence สำหรับ users (ถ้ามี id column และเป็น serial type)
DO $$
DECLARE
  seq_name TEXT;
BEGIN
  -- ตรวจสอบว่ามี column id และเป็น serial type ก่อนเรียก pg_get_serial_sequence
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'id'
    AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    BEGIN
      -- ตรวจสอบว่ามี sequence หรือไม่ (จะ return NULL ถ้าไม่มี sequence)
      SELECT pg_get_serial_sequence('users', 'id') INTO seq_name;
      IF seq_name IS NOT NULL AND seq_name != '' THEN
        EXECUTE 'ALTER SEQUENCE ' || seq_name || ' RESTART WITH 1';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- ถ้าเกิด error (เช่น column ไม่มีอยู่จริง) ให้ข้ามไป
        NULL;
    END;
  END IF;
END $$;

-- ============================================
-- ส่วนที่ 3: สร้าง Admin User ใหม่
-- ============================================

INSERT INTO users (
  "Email",
  "Password",
  "Username",
  "Phone",
  "Address",
  "RegisteredDate",
  "Role",
  "UserType",
  "BranchId",
  "TaxName",
  "TaxID",
  "TaxAddress"
) VALUES (
  'admin@gmail.com',                    -- Email
  'Admin2025',                          -- Password (ควรเปลี่ยนเป็นรหัสที่ปลอดภัยกว่า)
  'Admin RANGSAN',                      -- Username
  '061-732-1346',                       -- Phone
  '1102 ถนนประชาราษฎร์สาย 1',            -- Address
  NOW(),                                -- RegisteredDate (timestamp)
  'admin',                              -- Role
  'regular',                            -- UserType (admin ไม่ต้องเป็น franchise)
  NULL,                                 -- BranchId (admin ไม่มี branch)
  NULL,                                 -- TaxName
  NULL,                                 -- TaxID
  NULL                                  -- TaxAddress
);

-- ============================================
-- ส่วนที่ 4: ตรวจสอบผลลัพธ์
-- ============================================

-- ตรวจสอบจำนวน records
SELECT 
  'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'order', COUNT(*) FROM "order";

-- หมายเหตุ: ตาราง products ยังคงมีข้อมูลอยู่ (ไม่ถูกลบ)

-- ตรวจสอบ Admin User
SELECT "Email", "Username", "Role", "UserType", "RegisteredDate"
FROM users 
WHERE "Email" = 'admin@gmail.com';

-- ============================================
-- หมายเหตุ:
-- - หลังจากรัน script นี้:
--   1. Login ด้วย admin@gmail.com / Admin2025
--   2. เปลี่ยนรหัสผ่านในหน้า Profile (แนะนำ)
--   3. ข้อมูลสินค้าในตาราง products จะยังคงอยู่
--   4. ทดสอบระบบด้วยข้อมูลสินค้าที่มีอยู่
-- ============================================
