-- =============================================================================
-- แก้ประวัติ/ยอดเครดิตซ้ำจากออเดอร์เดียว (กรณี trigger FOR EACH ROW + แอปหักซ้ำ)
-- ออเดอร์: ORD1774407916682TVK9G
--
-- ขั้นตอน: รันเฉพาะ SELECT ก่อน → ตรวจผล → แล้วค่อยรัน DELETE/UPDATE ที่ comment ไว้
-- ถ้าชื่อคอลัมน์ในฐานข้อมูลไม่ตรง (เช่น ใช้ "OrderID" แทน orderid) ให้แก้ตามผลจาก:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name IN ('credit_usage_log','user_credits','order');
-- =============================================================================

-- ใช้ใน Supabase SQL Editor: แทนที่ ORD1774407916682TVK9G และอีเมลในขั้น 6 ตามจริง

-- -----------------------------------------------------------------------------
-- 1) ดูออเดอร์: อีเมลผู้สั่ง + ยอดรวมที่ควรหัก (ควรตรงกับ 1 ครั้ง)
-- -----------------------------------------------------------------------------
SELECT DISTINCT ON (o."OrderID")
  o."OrderID",
  o."UserEmail",
  o."Total",
  o."PaymentMethod"
FROM "order" o
WHERE o."OrderID" = 'ORD1774407916682TVK9G'
LIMIT 1;

-- ถ้า DISTINCT ON  error (บาง schema ไม่มี OrderID แบบ quote) ลอง:
-- SELECT * FROM "order" WHERE "OrderID" = 'ORD1774407916682TVK9G' LIMIT 3;

-- -----------------------------------------------------------------------------
-- 2) ดูแถวใน credit_usage_log ของออเดอร์นี้ (คาดว่ามีมากกว่า 1 แถวถ้าซ้ำ)
-- -----------------------------------------------------------------------------
SELECT *
FROM credit_usage_log
WHERE orderid = 'ORD1774407916682TVK9G'
ORDER BY id NULLS LAST, createdat NULLS LAST;

-- ถ้าไม่มีคอลัมน์ orderid ลอง:
-- SELECT * FROM credit_usage_log WHERE "OrderID" = 'ORD1774407916682TVK9G';

-- -----------------------------------------------------------------------------
-- 3) ดู user_credits ของอีเมลจากข้อ 1 (แทนอีเมลด้านล่าง)
-- -----------------------------------------------------------------------------
-- SELECT * FROM user_credits WHERE useremail = 'อีเมลจากขั้นตอน_1';

-- -----------------------------------------------------------------------------
-- 4) ตัดสินใจก่อนแก้
-- -----------------------------------------------------------------------------
-- ก) ถ้ามีแถว log ซ้ำ แต่ยอด balance ใน user_credits หักไปแค่ 1 ครั้ง (เท่ากับ Total ออเดอร์)
--    → ลบแถว log ที่ซ้ำออกอย่างเดียว (ขั้น 5) ไม่ต้องคืนเงิน
-- ข) ถ้า balance หักไปมากกว่า Total (เช่น หัก 750 แต่ Total 375)
--    → ทำขั้น 5 แล้วทำขั้น 6 เพื่อคืนเครดิตส่วนเกิน

-- -----------------------------------------------------------------------------
-- 5) ลบแถวซ้ำใน credit_usage_log — คงไว้เพียง 1 แถวต่อออเดอร์นี้ (ใช้ ctid ไม่พึ่งชื่อ id)
--     รันหลังตรวจ SELECT แล้วเท่านั้น
-- -----------------------------------------------------------------------------
/*
DELETE FROM credit_usage_log AS c
WHERE c.orderid = 'ORD1774407916682TVK9G'
  AND c.ctid <> (
    SELECT MIN(c2.ctid)
    FROM credit_usage_log AS c2
    WHERE c2.orderid = 'ORD1774407916682TVK9G'
  );
*/

-- ถ้าคอลัมน์เป็น "OrderID":
/*
DELETE FROM credit_usage_log AS c
WHERE c."OrderID" = 'ORD1774407916682TVK9G'
  AND c.ctid <> (
    SELECT MIN(c2.ctid)
    FROM credit_usage_log AS c2
    WHERE c2."OrderID" = 'ORD1774407916682TVK9G'
  );
*/

-- -----------------------------------------------------------------------------
-- 6) (ทางเลือก) คืนเครดิตที่ถูกหักเกิน — ใช้เมื่อยืนยันแล้วว่า balance หักเกินจริง
--     refund_amount = ยอดที่หักเกิน (ตัวอย่าง: ถ้าหักไป 750 แต่ควร 375 → ใส่ 375)
--     แทนอีเมลด้านล่างให้ตรงกับ "UserEmail" จากออเดอร์
-- -----------------------------------------------------------------------------
/*
UPDATE user_credits
SET
  balance = balance + 375::numeric,
  totalused = GREATEST(0, totalused - 375::numeric),
  updatedat = NOW()
WHERE useremail = 'ใส่อีเมลผู้ใช้ที่สั่งออเดอร์นี้';
*/

-- ถ้า primary key เป็น UserEmail (PascalCase):
/*
UPDATE user_credits
SET
  "Balance" = "Balance" + 375::numeric,
  "TotalUsed" = GREATEST(0, "TotalUsed" - 375::numeric),
  "UpdatedAt" = NOW()
WHERE "UserEmail" = 'ใส่อีเมลผู้ใช้ที่สั่งออเดอร์นี้';
*/

-- -----------------------------------------------------------------------------
-- 7) ตรวจอีกครั้งหลังแก้
-- -----------------------------------------------------------------------------
-- SELECT * FROM credit_usage_log WHERE orderid = 'ORD1774407916682TVK9G';
-- SELECT * FROM user_credits WHERE useremail = '...';
