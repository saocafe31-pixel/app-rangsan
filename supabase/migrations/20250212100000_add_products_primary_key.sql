-- เพิ่ม Primary Key ให้ตาราง products (ตัวเลือกที่ 1: คอลัมน์ id)
-- คอลัมน์ "ProductID" ไม่มีการเปลี่ยนประเภทหรือ constraint — แอปยังใช้ ProductID ตามเดิม

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass AND contype = 'p'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'id'
    ) THEN
      ALTER TABLE public.products
        ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
      ALTER TABLE public.products ADD PRIMARY KEY (id);
    ELSE
      ALTER TABLE public.products ADD PRIMARY KEY (id);
    END IF;
  END IF;
END $$;
