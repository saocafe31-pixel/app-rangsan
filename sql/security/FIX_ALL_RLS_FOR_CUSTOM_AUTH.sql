-- ============================================
-- แก้ไข RLS Policies สำหรับ Custom Authentication (ครบถ้วน)
-- ============================================
-- 
-- ⚠️ ปัญหา: RLS policies ใช้ auth.jwt() ->> 'email' ซึ่งต้องการ Supabase Auth JWT token
-- แต่แอปใช้ custom authentication จึงไม่มี JWT token และทำให้ไม่สามารถ INSERT/UPDATE/DELETE ข้อมูลได้
-- 
-- วิธีแก้ไข: ปิด RLS สำหรับตารางที่เกี่ยวข้องทั้งหมด
-- เพราะแอปจะตรวจสอบสิทธิ์เองใน frontend (custom authentication)
-- ============================================

-- ============================================
-- 0. ปิด RLS สำหรับตาราง users (จำเป็นสำหรับ Google OAuth + custom users)
-- ============================================
-- หลังล็อกอินด้วย Google แอปจะ INSERT แถวใน public.users ด้วย anon key
-- ถ้า RLS เปิดอยู่โดยไม่มี policy ที่อนุญาต → error: new row violates row-level security policy for table "users"

ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 1. ปิด RLS สำหรับ Credit Tables
-- ============================================

ALTER TABLE credit_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usage_log DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. ปิด RLS สำหรับ Order Tables
-- ============================================

ALTER TABLE "order" DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. ปิด RLS สำหรับ Notifications
-- ============================================

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. ปิด RLS สำหรับ Tax Invoices
-- ============================================

ALTER TABLE tax_invoices DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. ปิด RLS สำหรับ Purchase Orders
-- ============================================

ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE po_items DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. ปิด RLS สำหรับ Franchise Stock
-- ============================================

ALTER TABLE franchise_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE franchise_stock_logs DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. ปิด RLS สำหรับ User Approvals
-- ============================================

ALTER TABLE user_approvals DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. ปิด RLS สำหรับ Products
-- ============================================

-- ⚠️ จำเป็น: ต้องปิด RLS สำหรับ products เพื่อให้สามารถ INSERT/UPDATE/DELETE ได้
-- เพราะแอปใช้ custom authentication และไม่มี INSERT policy
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. ปิด RLS สำหรับ Stock Logs (ถ้าต้องการ)
-- ============================================

-- ถ้าต้องการให้ admin เท่านั้นที่เข้าถึงได้ ให้ comment บรรทัดนี้
ALTER TABLE stock_logs DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 9b. ปิด RLS สำหรับ shipping_rates (ตั้งค่าจัดส่ง / Checkout)
-- ============================================
-- ถ้า RLS เปิดโดยไม่มี policy → หน้าแอดมินไม่ดึงอัตราค่าจัดส่งได้ และบันทึกใหม่จะ error RLS

ALTER TABLE shipping_rates DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 9c. ตั้งค่า / คูปอง / โปรโมชั่น / ซัพพลายเออร์ (แอปอ่านเขียนด้วย anon key)
-- ============================================

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE coupons DISABLE ROW LEVEL SECURITY;
ALTER TABLE promotions DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 9d. ตารางจาก migration / ฟีเจอร์เสริม (ถ้ายังไม่มีใน DB จะข้าม — ไม่ error)
-- ============================================
-- suppliers: อาจสร้างจากสคริปต์แยกหรือ Table Editor
-- order_packing, other_supplier_products: migration / PO แฟรนไชส์
-- supplier_pin_locks: docs/supplier_pin_locks.sql
-- credit_approvals: sql/setup/SUPABASE_TABLES_SETUP.sql (optional — แอปยังไม่อ่าน)

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'suppliers',
    'order_packing',
    'other_supplier_products',
    'supplier_pin_locks',
    'credit_approvals'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 10. ตรวจสอบสถานะ RLS
-- ============================================

SELECT 
  tablename,
  CASE 
    WHEN rowsecurity THEN 'ENABLED ⚠️'
    ELSE 'DISABLED ✅'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'users',
  'credit_transactions', 'user_credits', 'credit_usage_log',
  'order', 'notifications', 'tax_invoices',
  'purchase_orders', 'po_items',
  'franchise_stock', 'franchise_stock_logs',
  'user_approvals', 'stock_logs', 'products', 'shipping_rates',
  'settings', 'coupons', 'promotions', 'suppliers',
  'order_packing', 'other_supplier_products',
  'supplier_pin_locks', 'credit_approvals'
)
ORDER BY tablename;

-- ============================================
-- หมายเหตุ:
-- - ตารางที่ปิด RLS แล้ว (ให้สอดคล้องแอปต้นฉบับที่ใช้ custom auth + anon client):
--   users, credit_transactions, user_credits, credit_usage_log,
--   order, notifications, tax_invoices, purchase_orders, po_items,
--   franchise_stock, franchise_stock_logs, user_approvals, stock_logs, products, shipping_rates,
--   settings, coupons, promotions, suppliers
--   และถ้ามีใน DB: order_packing, other_supplier_products, supplier_pin_locks, credit_approvals
-- - ⚠️ ต้องปิด RLS สำหรับ products เพื่อให้สามารถ INSERT/UPDATE/DELETE ได้
--   เพราะแอปใช้ custom authentication และไม่มี INSERT policy
-- - แอปจะตรวจสอบสิทธิ์เองใน frontend (custom authentication)
-- - หลังจากรัน script นี้ การ INSERT/UPDATE/DELETE ข้อมูลจะทำงานได้ปกติ
-- ============================================
