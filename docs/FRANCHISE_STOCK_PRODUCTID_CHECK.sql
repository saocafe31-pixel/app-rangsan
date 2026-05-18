-- ใช้รันใน Supabase SQL Editor เพื่อตรวจสอบความสัมพันธ์ franchise_stock กับ other_supplier_products
-- และรายการที่อาจมี productid ต่าง case หรือไม่ตรงกัน

-- 1) รายการใน franchise_stock ที่ productid ไม่มีใน other_supplier_products (เทียบแบบไม่สนใจตัวพิมพ์)
--    (สินค้าเหล่านี้เป็น "เพิ่มเอง" หรือจากหน้าหลัก ไม่จำเป็นต้องมีใน other_supplier_products)
SELECT DISTINCT f.branchid, f.productid, f.productname, f.iscustom,
       CASE WHEN o.productid IS NULL THEN 'ไม่มีใน other_supplier_products' ELSE 'มี' END AS ใน_other_supplier
FROM franchise_stock f
LEFT JOIN other_supplier_products o ON LOWER(TRIM(o.productid)) = LOWER(TRIM(f.productid))
ORDER BY f.branchid, f.productid;

-- 2) รายการใน franchise_stock ที่ productid มีช่องว่างหัวท้าย (ควร trim ในระบบหรืออัปเดตครั้งเดียว)
SELECT branchid, productid, productname, LENGTH(productid) AS len, productid != TRIM(productid) AS มีช่องว่าง
FROM franchise_stock
WHERE productid IS NOT NULL AND productid != TRIM(productid);

-- 3) (ถ้าต้องการให้ productid ใน franchise_stock เป็นรูปแบบเดียวกัน) อัปเดตเป็นตัวพิมพ์ใหญ่และ trim
--    รันเฉพาะเมื่อต้องการ normalize — แนะนำให้ backup ก่อน
-- UPDATE franchise_stock
-- SET productid = UPPER(TRIM(productid))
-- WHERE productid IS NOT NULL AND (productid != TRIM(productid) OR productid != UPPER(TRIM(productid)));
