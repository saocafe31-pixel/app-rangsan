-- รันคู่กับ supabase/migrations/20260402120000_products_storefront_visibility.sql (หรือรัน migration ผ่าน Supabase CLI)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS "VisibleOnHome" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "SaleToFranchise" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "SaleToRegular" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "SaleRestrictedToUsers" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "AllowedViewerEmails" text;
