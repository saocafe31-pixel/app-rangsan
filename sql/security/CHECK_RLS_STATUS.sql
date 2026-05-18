-- ============================================
-- ตรวจสอบสถานะ RLS ของตารางที่เกี่ยวข้อง
-- ============================================

-- ตรวจสอบสถานะ RLS
SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN rowsecurity THEN 'ENABLED ⚠️'
    ELSE 'DISABLED ✅'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'credit_transactions',
  'user_credits',
  'credit_usage_log',
  'order',
  'notifications',
  'tax_invoices',
  'purchase_orders',
  'po_items',
  'franchise_stock',
  'franchise_stock_logs',
  'user_approvals'
)
ORDER BY 
  CASE WHEN rowsecurity THEN 0 ELSE 1 END, -- RLS enabled tables first
  tablename;

-- ตรวจสอบตารางที่ยังเปิด RLS อยู่
SELECT 
  tablename,
  'RLS ENABLED ⚠️' as status
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = true
AND tablename IN (
  'credit_transactions',
  'user_credits',
  'credit_usage_log',
  'order',
  'notifications',
  'tax_invoices',
  'purchase_orders',
  'po_items',
  'franchise_stock',
  'franchise_stock_logs',
  'user_approvals'
)
ORDER BY tablename;
