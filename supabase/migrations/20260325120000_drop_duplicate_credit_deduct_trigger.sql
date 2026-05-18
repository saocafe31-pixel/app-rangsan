-- แก้การหักเครดิตซ้ำ / ประวัติ credit_usage_log ซ้ำสำหรับออเดอร์เดียวกัน
-- สาเหตุ: trigger_deduct_credit_on_order ทำงาน FOR EACH ROW ต่อทุกแถวใน order
--        ขณะที่แอปหักเครดิตอีกครั้งใน Checkout.jsx หลัง placeOrder
-- แอปเป็นตัวเดียวที่หักเครดิต (creditService / Checkout) — ไม่ใช้ trigger นี้

DROP TRIGGER IF EXISTS trigger_deduct_credit_on_order ON "order";
DROP FUNCTION IF EXISTS deduct_credit_on_order();
