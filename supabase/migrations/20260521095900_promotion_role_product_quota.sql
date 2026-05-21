-- เพิ่มกลุ่มลูกค้าเป้าหมายและโควต้าจำนวนสินค้า X สำหรับโปรโมชั่น
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "TargetCustomerType" TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "PromotionProductLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "PromotionProductUsed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_target_customer_type;

ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_target_customer_type CHECK (
    "TargetCustomerType" IN ('all', 'regular', 'franchise')
  );

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_product_quota_non_negative;

ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_product_quota_non_negative CHECK (
    "PromotionProductLimit" >= 0
    AND "PromotionProductUsed" >= 0
  );

COMMENT ON COLUMN public.promotions."TargetCustomerType" IS 'กลุ่มลูกค้าที่เห็น/ใช้โปรได้: all, regular, franchise';
COMMENT ON COLUMN public.promotions."PromotionProductLimit" IS 'จำนวนสินค้า X ที่จัดโปรทั้งหมด (0 = ใช้ตามสต็อกจริง)';
COMMENT ON COLUMN public.promotions."PromotionProductUsed" IS 'จำนวนสินค้า X ที่ถูกใช้โปรไปแล้ว';
