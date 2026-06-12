-- โครงสร้างฐานข้อมูลสำหรับฟีเจอร์แบ่งชำระ
-- หมายเหตุ: ตาราง "order" เดิมเก็บ 1 แถวต่อสินค้า จึงแยกแผนชำระออกมาต่อ OrderID

CREATE TABLE IF NOT EXISTS public.installment_plans (
  id BIGSERIAL PRIMARY KEY,
  orderid TEXT NOT NULL UNIQUE,
  useremail TEXT NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  deposit_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_installment_plans_total_non_negative CHECK (total_amount >= 0),
  CONSTRAINT chk_installment_plans_deposit_percent CHECK (deposit_percent >= 0 AND deposit_percent <= 100),
  CONSTRAINT chk_installment_plans_deposit_amount_non_negative CHECK (deposit_amount >= 0),
  CONSTRAINT chk_installment_plans_paid_amount_non_negative CHECK (paid_amount >= 0),
  CONSTRAINT chk_installment_plans_payment_status CHECK (
    payment_status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')
  )
);

CREATE TABLE IF NOT EXISTS public.installment_payments (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  orderid TEXT NOT NULL,
  useremail TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'transfer',
  slipurl TEXT,
  note TEXT,
  recorded_by TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_installment_payments_amount_positive CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS public.installment_reminders (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  orderid TEXT NOT NULL,
  useremail TEXT NOT NULL,
  reminder_days_before INTEGER NOT NULL,
  scheduled_for DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_installment_reminders_days_non_negative CHECK (reminder_days_before >= 0),
  CONSTRAINT chk_installment_reminders_status CHECK (
    status IN ('pending', 'sent', 'skipped', 'failed')
  ),
  CONSTRAINT uq_installment_reminders_schedule UNIQUE (plan_id, reminder_days_before, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_installment_plans_useremail ON public.installment_plans(useremail);
CREATE INDEX IF NOT EXISTS idx_installment_plans_payment_status ON public.installment_plans(payment_status);
CREATE INDEX IF NOT EXISTS idx_installment_plans_due_date ON public.installment_plans(due_date);
CREATE INDEX IF NOT EXISTS idx_installment_payments_plan_id ON public.installment_payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_installment_payments_orderid ON public.installment_payments(orderid);
CREATE INDEX IF NOT EXISTS idx_installment_payments_useremail ON public.installment_payments(useremail);
CREATE INDEX IF NOT EXISTS idx_installment_reminders_status_schedule ON public.installment_reminders(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_installment_reminders_useremail ON public.installment_reminders(useremail);

CREATE OR REPLACE FUNCTION public.set_installment_plan_updatedat()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_installment_plans_updatedat ON public.installment_plans;
CREATE TRIGGER trg_installment_plans_updatedat
BEFORE UPDATE ON public.installment_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_installment_plan_updatedat();

ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_reminders ENABLE ROW LEVEL SECURITY;

-- โปรเจกต์นี้ใช้ custom auth ผ่านตาราง users และเรียก Supabase จาก frontend ด้วย anon key
-- จึงเปิด policy แบบเดียวกับ flow ปัจจุบันก่อน เพื่อไม่ให้ฟีเจอร์เดิมพังหลังเปิด RLS
-- หากย้ายเป็น Supabase Auth ควรเปลี่ยนเป็น policy ตาม auth.uid()/JWT claims ที่ปลอดภัยกว่า
CREATE POLICY "installment_plans_client_select"
ON public.installment_plans FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "installment_plans_client_insert"
ON public.installment_plans FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "installment_plans_client_update"
ON public.installment_plans FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "installment_payments_client_select"
ON public.installment_payments FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "installment_payments_client_insert"
ON public.installment_payments FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "installment_reminders_client_select"
ON public.installment_reminders FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "installment_reminders_client_insert"
ON public.installment_reminders FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "installment_reminders_client_update"
ON public.installment_reminders FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

INSERT INTO public.settings (key, value, updatedat)
VALUES (
  'installment_payments',
  '{"enabled": false, "allowedEmails": [], "reminderDaysBefore": [3, 2]}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
