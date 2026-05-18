-- การมองเห็นสินค้าบนหน้าแคตตาล็อก (หน้าหลัก) และกลุ่มลูกค้าที่เปิดขาย
-- VisibleOnHome: false = ไม่แสดงในรายการหน้าหลัก (ยังจัดการในสต็อกได้)
-- SaleRestrictedToUsers: true = เห็นได้เฉพาะอีเมลใน AllowedViewerEmails (JSON array)
-- มิฉะนั้นใช้ SaleToFranchise / SaleToRegular ตามประเภทลูกค้า

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS "VisibleOnHome" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "SaleToFranchise" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "SaleToRegular" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "SaleRestrictedToUsers" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "AllowedViewerEmails" text;

COMMENT ON COLUMN products."VisibleOnHome" IS 'แสดงสินค้าในหน้าแคตตาล็อกหลัก';
COMMENT ON COLUMN products."SaleToFranchise" IS 'เปิดให้ลูกค้าแฟรนไชส์เห็น/สั่ง (เมื่อไม่จำกัดเฉพาะอีเมล)';
COMMENT ON COLUMN products."SaleToRegular" IS 'เปิดให้ลูกค้าทั่วไปเห็น/สั่ง (เมื่อไม่จำกัดเฉพาะอีเมล)';
COMMENT ON COLUMN products."SaleRestrictedToUsers" IS 'true = เห็นได้เฉพาะอีเมลใน AllowedViewerEmails';
COMMENT ON COLUMN products."AllowedViewerEmails" IS 'JSON array ของอีเมล เช่น ["a@b.com","c@d.com"]';
