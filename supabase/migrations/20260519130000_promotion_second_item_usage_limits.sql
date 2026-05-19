-- โปรชิ้นที่ 2 ลดบาท/เปอร์เซ็น + จำกัดการใช้ต่อคนและรวมทั้งโปร
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_type;

ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_type CHECK (
    "Type" IN (
      'buy_x_get_y',
      'discount_percentage',
      'discount_fixed',
      'target_unit_price',
      'second_item_discount'
    )
  );

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "UsageLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "TotalUsageLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "UsageCount" INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.promotions."UsageLimit" IS 'จำกัดครั้งต่อผู้ใช้ (0 = ไม่จำกัด)';
COMMENT ON COLUMN public.promotions."TotalUsageLimit" IS 'จำกัดครั้งรวมทั้งโปร (0 = ไม่จำกัด)';
COMMENT ON COLUMN public.promotions."UsageCount" IS 'จำนวนครั้งที่ใช้ไปแล้วรวมทั้งโปร';
