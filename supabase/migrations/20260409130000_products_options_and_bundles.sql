-- ตัวเลือกสินค้า (สี/ขนาด ฯลฯ) และชุดสินค้า (bundle) สำหรับ products

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "IsBundle" boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "ProductOptions" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "BundleLines" jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.products."IsBundle" IS 'true = สินค้าชุด ตัดสต็อกตาม BundleLines ร่วมกับ OrderStep';
COMMENT ON COLUMN public.products."ProductOptions" IS 'JSON [{name, required, values:[{label}]}] ตัวเลือกให้ลูกค้าเลือกตอนสั่ง';
COMMENT ON COLUMN public.products."BundleLines" IS 'JSON [{productId, qty}] จำนวนส่วนประกอบต่อหนึ่งรอบขั้นต่ำ (OrderStep)';
