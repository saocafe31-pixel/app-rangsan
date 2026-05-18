-- ============================================
-- Database Triggers
-- สำหรับอัปเดตข้อมูลอัตโนมัติ
-- ============================================
-- หมายเหตุ: ตารางจาก sql/setup/SUPABASE_TABLES_SETUP.sql ใช้ชื่อคอลัมน์แบบไม่ใส่ quote
--   → PostgreSQL เก็บเป็นตัวพิ่มเล็ก (useremail, status, amount, ...)
-- ตาราง "order" ในโปรเจกต์นี้มักสร้างด้วย "OrderID", "Status" (PascalCase มี quote) — คงรูปแบบนั้นในส่วน order

-- ============================================
-- 1. (ลบ) TRIGGER อัปเดต user_credits เมื่ออนุมัติ credit_transactions
-- ============================================
-- เดิมมี trigger บวกยอดใน user_credits เมื่อ status = approved
-- แต่แอปทำแล้วใน src/services/creditService.js (approveCreditTransaction) — ถ้าเก็บ trigger จะบวกซ้ำสองครั้ง
-- ถ้าต้องการให้ DB เป็นตัวเดียวที่อัปเดตยอด: ลบการอัปเดต user_credits ออกจาก approveCreditTransaction แทน
DROP TRIGGER IF EXISTS trigger_update_user_credit_balance ON credit_transactions;
DROP FUNCTION IF EXISTS update_user_credit_balance();

-- ============================================
-- 2. (ลบ) TRIGGER หักเครดิตตอน INSERT order — อย่าใช้ร่วมกับแอป
-- ============================================
-- เดิม FOR EACH ROW ทำให้หักเครดิต + ใส่ credit_usage_log ซ้ำตามจำนวนรายการในตะกร้า
-- และ Checkout.jsx หักเครดิตอีกครั้งหลัง placeOrder → ซ้ำซ้อน / ยอดผิด
-- การหักเครดิตทำที่ src/pages/Checkout.jsx + creditService.deductCredit เท่านั้น
DROP TRIGGER IF EXISTS trigger_deduct_credit_on_order ON "order";
DROP FUNCTION IF EXISTS deduct_credit_on_order();

-- ============================================
-- 3. TRIGGER: Create notification when order status changes
-- ============================================
-- Note: This can also be handled in application code

-- Function to create notification on order status change
CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify if status actually changed
    IF OLD."Status" IS DISTINCT FROM NEW."Status" AND NEW."Status" != 'รอตรวจสอบ' THEN
        INSERT INTO notifications (useremail, type, title, message, orderid, metadata)
        VALUES (
            NEW."UserEmail",
            'order_status_changed',
            'สถานะออเดอร์เปลี่ยนแปลง',
            'ออเดอร์ ' || NEW."OrderID" || ' สถานะเปลี่ยนเป็น: ' || NEW."Status",
            NEW."OrderID",
            jsonb_build_object(
                'status', NEW."Status",
                'oldStatus', OLD."Status",
                'trackingNo', NEW."TrackingNo"
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_order_status_change ON "order";
CREATE TRIGGER trigger_notify_order_status_change
    AFTER UPDATE OF "Status" ON "order"
    FOR EACH ROW
    EXECUTE FUNCTION notify_order_status_change();

-- ============================================
-- NOTES:
-- ============================================
-- 1. Triggers จะทำงานอัตโนมัติเมื่อมีการ INSERT/UPDATE
-- 2. ควรทดสอบ triggers หลังจากสร้าง
-- 3. ถ้าไม่ต้องการใช้ triggers สามารถลบได้ด้วย: DROP TRIGGER trigger_name ON table_name;
-- 4. สำหรับการแจ้งเตือน อาจจะดีกว่าถ้าทำใน application code เพื่อให้ควบคุมได้ง่ายกว่า
