-- เพิ่มประเภทโปรโมชั่น: ราคาพิเศษต่อชิ้น (ใช้คอลัมน์ DiscountAmount เป็นราคาขายต่อหน่วย)
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_type;

ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_type CHECK (
    "Type" IN (
      'buy_x_get_y',
      'discount_percentage',
      'discount_fixed',
      'target_unit_price'
    )
  );

COMMENT ON COLUMN public.promotions."DiscountAmount" IS 'discount_fixed=ลดต่อชิ้น(บาท), target_unit_price=ราคาขายต่อชิ้น(บาท)';
