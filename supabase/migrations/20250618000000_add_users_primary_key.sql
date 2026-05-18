-- เพิ่ม Primary Key ให้ตาราง users เพื่อให้สามารถแก้ไข/ลบแถวใน Table Editor ได้
-- Supabase ต้องการ primary key เป็น unique identifier ของแต่ละแถวก่อนจะอนุญาตให้ update/delete

DO $$
BEGIN
  -- ถ้าตารางยังไม่มี primary key
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'p'
  ) THEN
    -- ถ้ายังไม่มีคอลัมน์ id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
    ) THEN
      ALTER TABLE public.users
        ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
      ALTER TABLE public.users ADD PRIMARY KEY (id);
    ELSE
      ALTER TABLE public.users ADD PRIMARY KEY (id);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.users.id IS 'Primary key สำหรับอ้างอิงแต่ละแถว (ใช้โดย Table Editor และ RLS)';
