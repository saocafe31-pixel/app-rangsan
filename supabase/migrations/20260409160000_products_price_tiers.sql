-- ราคาขั้นบันไดต่อจำนวน (minQty) สำหรับสินค้า — เก็บเป็น JSON array
alter table public.products
  add column if not exists "PriceTiers" jsonb not null default '[]'::jsonb;

comment on column public.products."PriceTiers" is 'JSON [{minQty, price, franchisePrice?}] สูงสุด 4 ขั้น — ราคาในแต่ละขั้น = ราคาต่อหนึ่ง OrderStep เหมือนคอลัมน์ Price';
