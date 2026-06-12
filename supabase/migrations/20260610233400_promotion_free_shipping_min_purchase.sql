-- โปรซื้อครบยอดที่กำหนดแล้วส่งฟรีตาม Supplier ที่เข้าร่วม
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_type;

ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_type CHECK (
    "Type" IN (
      'buy_x_get_y',
      'discount_percentage',
      'discount_fixed',
      'target_unit_price',
      'second_item_discount',
      'free_shipping_min_purchase'
    )
  );

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "AllowedSupplierKeys" JSONB;

COMMENT ON COLUMN public.promotions."AllowedSupplierKeys" IS 'รายชื่อ Supplier ที่เข้าร่วมโปร/คูปอง (null = ไม่กำหนด)';
