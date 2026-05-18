# คู่มือ Deploy Production (5.2–5.4)

เอกสารนี้รวมขั้นตอน **Database Production**, **Frontend Deployment** และ **Monitoring** ตาม DEVELOPMENT_ROADMAP

---

## 5.2 ตั้งค่า Database (Supabase Production)

### ตัวเลือก A: ใช้โปรเจกต์ Supabase เดิมเป็น Production

ถ้าโปรเจกต์ที่ใช้พัฒนาอยู่แล้วจะใช้เป็น production ได้เลย:

1. **ตรวจสอบข้อมูลสำคัญ**
   - Supabase Dashboard → **Table Editor** / **SQL Editor** ตรวจว่าตารางครบ (users, products, order, user_credits ฯลฯ)
   - ตรวจสอบ **Constraints** ตาม `CONSTRAINTS_COMPLETE_SUMMARY.md` (ถ้ามี)

2. **ตาราง suppliers (สำหรับหน้า Admin จัดการซัพพลายเออร์)**  
   ถ้าใช้หน้าจัดการซัพพลายเออร์ (`/admin/suppliers`) ให้รัน SQL นี้ใน Supabase → SQL Editor:
   ```sql
   CREATE TABLE IF NOT EXISTS suppliers (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL UNIQUE,
     contact text,
     phone text,
     created_at timestamptz DEFAULT now()
   );
   ```

3. **ตาราง shipping_rates (สำหรับหน้ากำหนดค่าการจัดส่ง)**  
   หน้า "ตั้งค่าการจัดส่ง" ใช้คอลัมน์ `id` ในการแก้ไข/ลบอัตราค่าจัดส่ง — ตารางต้องมีคอลัมน์ `id`
   - **ถ้ายังไม่มีตาราง** ให้รัน SQL สร้างตาราง (มี id ตั้งแต่ต้น):
   ```sql
   CREATE TABLE IF NOT EXISTS shipping_rates (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "MinWeight" numeric NOT NULL DEFAULT 0,
     "MaxWeight" numeric NOT NULL DEFAULT 0,
     "Price" numeric NOT NULL DEFAULT 0
   );
   ```
   - **ถ้ามีตาราง shipping_rates อยู่แล้วแต่ไม่มีคอลัมน์ id** (เจอ error "column shipping_rates.id does not exist") ให้รัน SQL นี้ใน Supabase → SQL Editor เพื่อเพิ่มคอลัมน์ `id` ให้แถวเดิม (แถวเก่าจะได้ id อัตโนมัติ):
   ```sql
   ALTER TABLE shipping_rates
     ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
   -- ทำให้ id เป็น primary key (รันได้ถ้าตารางยังไม่มี primary key)
   DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'shipping_rates'::regclass AND contype = 'p'
     ) THEN
       ALTER TABLE shipping_rates ADD PRIMARY KEY (id);
     END IF;
   END $$;
   ```

4. **ตาราง products (เพิ่ม Primary Key ถ้ายังไม่มี)**  
   ถ้าตาราง `products` ยังไม่มี primary key (ส่งออกหรือแก้ไขใน Table Editor มีข้อจำกัด) ให้รันสคริปต์ใน `sql/setup/ADD_PRODUCTS_PRIMARY_KEY.sql` ใน Supabase → SQL Editor. ตัวเลือกที่ 1 จะเพิ่มคอลัมน์ `id` (uuid) เป็น PK โดยไม่กระทบข้อมูลเดิม; แอปยังอ้างอิงสินค้าด้วย `ProductID` อยู่เหมือนเดิม.

5. **ตาราง order (รองรับราคาทศนิยม)**  
   ถ้าเปลี่ยนคอลัมน์ `Price` ในตาราง `products` เป็น `numeric` แล้ว ต้องให้ตาราง `order` รองรับทศนิยมด้วย (มิฉะนั้นกดสั่งซื้อจะ error `invalid input syntax for type bigint: "2.8"`).
   - **วิธีที่ 1 (CLI):** จากโฟลเดอร์โปรเจกต์ รัน `npm run supabase link` (ถ้ายังไม่เคย link) แล้วรัน `npm run supabase db push` — จะ apply migration ใน `supabase/migrations/20250303100000_alter_order_table_numeric.sql` ขึ้น remote อัตโนมัติ (ใช้ `npx supabase ...` แทนได้ถ้าต้องการ)
   - **วิธีที่ 2 (Dashboard):** รันสคริปต์ใน `sql/setup/ALTER_ORDER_TABLE_NUMERIC.sql` ใน Supabase → SQL Editor

5.1 **ฟีเจอร์แพ็กสินค้าและรายงานจัดส่ง**  
   - รัน migration `supabase/migrations/20250612000000_add_order_productid_and_packing.sql` (ผ่าน `supabase db push` หรือ copy เนื้อหาไปรันใน SQL Editor) เพื่อเพิ่ม: คอลัมน์ `ProductID` ในตาราง `order`, ตาราง `order_packing`, คอลัมน์ที่อยู่ผู้รับใน `order` (Subdistrict, District, Province, PostalCode, RecipientPhone), และคอลัมน์ที่อยู่ใน `users` (Subdistrict, District, Province, PostalCode)
   - หลังรันแล้ว: หน้าจัดการออเดอร์ → แท็บ "กำลังจัดเตรียม" จะมีปุ่ม "แพ็กสินค้า" และ "ส่งออกรายงาน CSV" ใช้ได้

6. **RLS (Row Level Security)**
   - โปรเจกต์นี้ใช้ **custom auth** (login ผ่านตาราง users) และปิด RLS สำหรับตารางที่แอปเข้าใช้
   - Dashboard → **Authentication** → **Policies** ตรวจว่าตารางที่จำเป็นไม่มี policy บล็อกการอ่าน/เขียน (หรือปิด RLS ตามที่ตั้งไว้)

7. **Backup**
   - Dashboard → **Database** → **Backups** ตรวจว่า Point-in-time recovery / daily backup เปิดอยู่ (ตาม plan)
   - ก่อนเปลี่ยนอะไรสำคัญ: **SQL Editor** → export หรือ backup ข้อมูลสำคัญ

### ตัวเลือก B: สร้างโปรเจกต์ Supabase ใหม่สำหรับ Production

1. สร้างโปรเจกต์ใหม่ที่ [Supabase Dashboard](https://supabase.com/dashboard) (เลือก region ที่ใกล้ผู้ใช้)
2. **สร้างตารางและ constraints** ตาม schema ที่ใช้ใน dev (หรือใช้ SQL dump / migration จากโปรเจกต์ dev)
3. **ตั้งค่า Auth**
   - Authentication → **Providers** → เปิด **Google** ถ้าใช้ลงชื่อด้วย Google (ใส่ Client ID / Secret จาก Google Cloud Console)
   - **URL Configuration**: ตั้ง **Site URL** และ **Redirect URLs** เป็น URL production (ดูหัวข้อ 5.3)
4. **คัดลอก API keys** จาก Project Settings → API ไปใส่ใน Environment Variables ของ Vercel/Netlify (ไม่ใส่ใน Git)

### Environment Variables ที่แอปใช้ (จาก DB)

| ตัวแปร | ความหมาย | ใช้จาก |
|--------|----------|--------|
| `VITE_SUPABASE_URL` | Project URL | Supabase → Project Settings → API |
| `VITE_SUPABASE_KEY` | anon / public key | เดียวกัน |

---

## 5.3 Frontend Deployment (Vercel / Netlify)

### Vercel (แนะนำ)

1. **เชื่อม repo**
   - [Vercel Dashboard](https://vercel.com/dashboard) → **Add New** → **Project** → เลือก Git repo
   - Framework Preset: **Vite** (หรือให้ Vercel ตรวจจับอัตโนมัติ)
   - Root Directory: ว่าง (หรือโฟลเดอร์ที่เก็บโปรเจกต์)
   - Build Command: `npm run build` (ค่าเริ่มต้น)
   - Output Directory: `dist`

2. **Environment Variables**
   - **Settings** → **Environment Variables** เพิ่ม:
     - `VITE_SUPABASE_URL` = Project URL จาก Supabase
     - `VITE_SUPABASE_KEY` = anon public key
   - เลือก **Production** (และ **Preview** ถ้าต้องการ)
   - หลังเพิ่ม/แก้ค่าให้ **Redeploy** (Deployments → ... → Redeploy)

3. **Deploy**
   - กด **Deploy** หรือ push ขึ้น Git เพื่อ trigger build
   - หลังสำเร็จจะได้ URL แบบ `https://xxx.vercel.app`

4. **Custom Domain (ถ้าต้องการ)**
   - **Settings** → **Domains** → Add domain
   - ตามขั้นตอนของ Vercel (เพิ่ม CNAME / A record ที่ผู้ให้บริการโดเมน) → SSL จะออกให้อัตโนมัติ

รายละเอียดเพิ่ม: ดู **ENV_SETUP.md** หัวข้อ 7 (Deploy บน Vercel) และหัวข้อ 5 (Redirect URL หลังลงชื่อด้วย Google)

### Netlify

1. **Add new site** → Import จาก Git → เลือก repo
2. **Build settings**
   - Build command: `npm run build`
   - Publish directory: `dist`
3. **Environment variables**: **Site settings** → **Environment variables** → เพิ่ม `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`
4. **Custom domain**: **Domain management** → Add custom domain → ตั้งค่า DNS ตามที่ Netlify แนะนำ

### หลัง Deploy แล้ว (ทั้ง Vercel และ Netlify)

- ตั้งค่า **Supabase** → Authentication → URL Configuration:
  - **Site URL**: `https://โดเมน-production-ของคุณ` (เช่น `https://rangsan.vercel.app`)
  - **Redirect URLs**: ต้องมี **`https://โดเมน-production-ของคุณ/auth/callback`** (เช่น `https://rangsan.vercel.app/auth/callback`)
  - ถ้ามีหลายโดเมน (เช่น custom domain) ให้เพิ่มทั้งคู่ใน Redirect URLs

### แก้เมื่อเจอ "ไม่สามารถยืนยันการเข้าสู่ระบบได้" (หลังกดเข้าสู่ระบบด้วย Google)

ข้อความนี้มักเกิดตอน **exchange code หลัง redirect จาก Google** ล้มเหลว สาเหตุที่พบบ่อย:

1. **Redirect URL ไม่ตรง**  
   ใน Supabase → **Authentication** → **URL Configuration** → **Redirect URLs** ต้องมี URL ที่ผู้ใช้ถูกส่งกลับมาจริง เช่น  
   `https://rangsan.vercel.app/auth/callback`  
   (ห้ามมี slash ท้าย เช่น `https://rangsan.vercel.app/auth/callback/`)  
   ถ้าใช้ custom domain ให้เพิ่มทั้ง Vercel URL และโดเมนจริง

2. **Site URL ผิด**  
   ตั้ง **Site URL** เป็นโดเมนหลักที่ใช้เข้าแอป (เช่น `https://rangsan.vercel.app`)

3. **ใช้ code ซ้ำหรือหมดอายุ**  
   ให้ผู้ใช้กด "เข้าสู่ระบบด้วย Google" ใหม่อีกครั้ง (ไม่ refresh หน้ารองรับ callback)

4. **ลงชื่อจาก WebView / in-app browser**  
   บางแอป (เช่น Line, Instagram) เปิดลิงก์ใน WebView ซึ่ง Google OAuth อาจไม่รองรับ แนะนำให้เปิดในเบราว์เซอร์ปกติ (Safari, Chrome)

5. **"PKCE code verifier not found" / "Tracking Prevention blocked access to storage"**  
   โปรเจกต์นี้ใช้ **implicit flow** (ไม่ใช้ PKCE) เพื่อเลี่ยงปัญหาเมื่อ Edge/Safari บล็อก storage หลัง redirect จาก Google. ถ้ายังเจอ: แนะนำผู้ใช้ปิด Tracking Prevention (Edge → Settings → Privacy → Exceptions เพิ่ม rangsan.vercel.app) หรือใช้ Chrome. หมายเหตุ: คำเตือน "Tracking Prevention blocked... font-awesome" มาจาก CDN ไม่เกี่ยวกับ auth

---

## 5.4 Monitoring & Error Tracking (Sentry ฯลฯ)

### แนวทางในโค้ด (ทำแล้ว)

- **Error Boundary** – component จับ error ใน React tree แล้วแสดงหน้าข้อความแทน crash ทั้งหน้า (ดู `src/components/common/ErrorBoundary.jsx`)
- **reportError** – ฟังก์ชันใน `src/utils/errorReport.js` สำหรับส่ง error ไปที่ monitoring (ตอนนี้ log ลง console; เมื่อใส่ Sentry จะเรียก Sentry.captureException ในนี้)

### การติดตั้ง Sentry (เมื่อพร้อม)

1. สมัคร [Sentry](https://sentry.io) → สร้างโปรเจกต์ (แพลตฟอร์มเลือก **React** / **Vite**)
2. ติดตั้ง SDK:
   ```bash
   npm install @sentry/react
   ```
3. ในโปรเจกต์จะได้ **DSN** (ตัวอย่าง `https://xxx@xxx.ingest.sentry.io/xxx`) → ใส่ใน env เป็น `VITE_SENTRY_DSN`
4. ตั้งค่าใน `main.jsx` (หรือจุดเข้าแอป):
   - import `* as Sentry from "@sentry/react"`
   - เรียก `Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE, ... })`
5. ใน `src/utils/errorReport.js` เมื่อมี `VITE_SENTRY_DSN` ให้เรียก `Sentry.captureException(error)` แทนหรือเสริมการ log
6. **Environment Variables บน Vercel/Netlify**: เพิ่ม `VITE_SENTRY_DSN` (เฉพาะ production ก็ได้)

เมื่อตั้งครบ แอปจะส่ง error ที่จับได้ไปที่ Sentry เพื่อดู stack trace, จำนวนครั้งเกิด, ผู้ใช้ที่เจอ ฯลฯ

### ทางเลือกอื่น

- **LogRocket**, **BugSnag** ฯลฯ – ใช้แนวทางเดียวกัน: ติดตั้ง SDK แล้วส่ง error จาก Error Boundary / reportError ไปที่บริการนั้น

---

## Checklist ก่อนขึ้น Production

- [ ] ตั้งค่า Supabase Production (หรือใช้โปรเจกต์เดิม) และ backup
- [ ] ตั้งค่า Environment Variables บน Vercel/Netlify (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`)
- [ ] ตั้งค่า Supabase Redirect URLs ให้ชี้ไปที่ URL production
- [ ] ทดสอบลงชื่อ (อีเมล/รหัสผ่าน และ Google ถ้าใช้)
- [ ] (ถ้าต้องการ) Custom domain + SSL
- [ ] (ถ้าต้องการ) ติดตั้ง Sentry แล้วใส่ `VITE_SENTRY_DSN`
