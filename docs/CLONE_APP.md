# วิธีโคลนแอป APP RANGSAN ทั้งหมด

เอกสารนี้อธิบายขั้นตอนการ **โคลนโปรเจกต์แอปนี้ทั้งหมด** ไปรันบนเครื่องหรือเซิร์ฟเวอร์ใหม่ โดยมีฐานข้อมูล Supabase แยกเป็นของตัวเอง

> **ดัชนีเอกสาร:** [docs/README.md](./README.md) · **เริ่มต้นเร็วที่รากโปรเจกต์:** [../README.md](../README.md)

---

## เช็กลิสต์หลังได้โฟลเดอร์ (Git clone หรือ copy)

| ขั้น | ทำอะไร |
|------|--------|
| 1 | **อย่า** ใช้ `.env.local` จากเครื่องเดิม — สร้างใหม่จาก `.env.example` |
| 2 | รัน `npm install` (ไม่ต้อง copy `node_modules` จากต้นฉบับ) |
| 3 | สร้างโปรเจกต์ **Supabase ใหม่** แล้วรัน SQL ตามหัวข้อ "ขั้นตอนที่ 3" ด้านล่าง |
| 4 | ตั้ง `VITE_SUPABASE_URL` และ `VITE_SUPABASE_KEY` ใน `.env.local` (และบน Vercel ถ้า deploy) |
| 5 | (ถ้าใช้ Git แยก) ลบ `.git` เดิมหรือเปลี่ยน `remote` ไป repo ใหม่ — อย่า push ทับต้นฉบับโดยไม่ตั้งใจ |

---

## ⚠️ เมื่อโคลนโดยการคัดลอกโฟลเดอร์ — สิ่งที่ต้องแก้ก่อนเริ่มงาน

ถ้าคุณ**คัดลอกโฟลเดอร์** (ไม่ใช่ fork/clone จาก Git) เพื่อได้โปรเจกต์แยกไว้ใช้งาน **ต้องแก้การเชื่อมต่อดังนี้** เพื่อไม่ให้กระทบไฟล์ต้นฉบับ ฐานข้อมูลเดิม และ Vercel เดิม

### 1. ฐานข้อมูล Supabase (สำคัญที่สุด)

แอปเชื่อมกับ Supabase ผ่านไฟล์ **`.env.local`** เท่านั้น (ไม่มี URL/key แบบ hardcode ในโค้ด)

| สิ่งที่ทำ | เหตุผล |
|-----------|--------|
| **อย่าใช้ `.env.local` ของโฟลเดอร์ต้นฉบับ** | ค่าในนั้นชี้ไปที่โปรเจกต์ Supabase เดิม — ถ้าใช้ต่อ แอปที่รันจากโฟลเดอร์โคลนจะอ่าน/เขียนฐานข้อมูลเดิม ทำให้กระทบต้นฉบับ |
| **สร้างโปรเจกต์ Supabase ใหม่** | ไป [Supabase Dashboard](https://supabase.com/dashboard) → New Project → ตั้งชื่อ/Region/รหัสผ่าน |
| **สร้าง `.env.local` ใหม่ในโฟลเดอร์โคลน** | คัดลอกจาก `.env.example` แล้วใส่ **Project URL** และ **anon key** จากโปรเจกต์ Supabase **ใหม่** เท่านั้น |

ขั้นตอนย่อ:

1. ในโฟลเดอร์ที่โคลน: ลบหรือไม่ต้อง copy ไฟล์ `.env.local` ของต้นฉบับ
2. สร้าง `.env.local` ใหม่: `Copy-Item .env.example .env.local` (PowerShell) หรือ `cp .env.example .env.local` (Mac/Linux)
3. เปิดโปรเจกต์ **ใหม่** ใน Supabase → Project Settings → API → คัดลอก **Project URL** และ **anon public** key ไปใส่ใน `.env.local` ของโฟลเดอร์โคลน
4. รัน SQL สร้างตารางในโปรเจกต์ Supabase **ใหม่** ตามขั้นตอนที่ 3 ด้านล่าง

ผลลัพธ์: แอปที่รันจากโฟลเดอร์โคลนจะเชื่อมกับ **ฐานข้อมูลใหม่** เท่านั้น ไม่กระทบฐานข้อมูลเดิม

---

### 2. หน้าบ้าน / Deploy (Vercel)

การ deploy ไม่ได้เก็บอยู่ในโฟลเดอร์ — อยู่ที่ Vercel/Netlify ที่เชื่อมกับ Git repo

| สิ่งที่ทำ | เหตุผล |
|-----------|--------|
| **อย่า deploy โฟลเดอร์โคลนไปที่ Vercel โปรเจกต์เดิม** | ถ้าไปผูกกับโปรเจกต์เดิมและ push จากโฟลเดอร์โคลน จะทับ/กระทบการ deploy ของต้นฉบับ |
| **ใช้ Vercel โปรเจกต์ใหม่** | สร้าง Project ใหม่ใน Vercel → Import จาก **Git repo ใหม่** (ที่คุณ push โฟลเดอร์โคลนขึ้นไป) หรือ Deploy จากโฟลเดอร์โดยไม่ผูกกับ repo เดิม |
| **ตั้ง Environment Variables ใน Vercel โปรเจกต์ใหม่** | ใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_KEY` จากโปรเจกต์ **Supabase ใหม่** (ข้อ 1) — ไม่ใช้ค่าจากต้นฉบับ |

ขั้นตอนย่อ (เมื่อจะ deploy โฟลเดอร์โคลน):

1. (ถ้าต้องการใช้ Git) สร้าง repo ใหม่บน GitHub/GitLab แล้ว push โฟลเดอร์โคลนขึ้น repo นี้ — **อย่า push ไป repo เดิมของต้นฉบับ**
2. ใน Vercel → Add New Project → เลือก **repo ใหม่** (หรืออัปโหลดโฟลเดอร์โดยตรง)
3. ในโปรเจกต์ Vercel **นี้** → Settings → Environment Variables ใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_KEY` ของ **Supabase โปรเจกต์ใหม่**
4. หลัง deploy ได้ URL ใหม่ (เช่น `https://clone-app.vercel.app`) ไปตั้งใน Supabase โปรเจกต์ใหม่ → Authentication → URL Configuration (Site URL และ Redirect URLs) ให้ชี้ไปที่ URL นี้

ผลลัพธ์: หน้าบ้านต้นฉบับ (Vercel เดิม) ยังชี้ไปที่ Supabase เดิมและ repo เดิม ไม่กระทบกัน

---

### 3. Git (ถ้าใช้)

| สิ่งที่ทำ | เหตุผล |
|-----------|--------|
| **แยก repo** | ในโฟลเดอร์โคลน: ลบโฟลเดอร์ `.git` หรือ `git remote remove origin` แล้วเพิ่ม remote ใหม่ชี้ไปที่ **repo ใหม่** — จะได้ push ขึ้น repo แยก ไม่ทับต้นฉบับ |

```powershell
# ในโฟลเดอร์โคลน (ถ้าต้องการเริ่ม Git ใหม่แยกจากต้นฉบับ)
Remove-Item -Recurse -Force .git
git init
git remote add origin https://github.com/your-username/your-clone-repo.git
```

---

### สรุปสั้น ๆ

| ส่วน | แก้อย่างไร เพื่อไม่กระทบต้นฉบับ |
|------|----------------------------------|
| **ฐานข้อมูล** | ใช้โปรเจกต์ **Supabase ใหม่** + สร้าง `.env.local` ใหม่ในโฟลเดอร์โคลน ให้ชี้ไปที่โปรเจกต์ใหม่เท่านั้น |
| **หน้าบ้าน Vercel** | Deploy โฟลเดอร์โคลนเป็น **Vercel โปรเจกต์ใหม่** และตั้ง env ในโปรเจกต์ใหม่ให้ชี้ไปที่ Supabase โปรเจกต์ใหม่ |
| **Git** | Push โฟลเดอร์โคลนไป **repo ใหม่** (หรือลบ `.git` แล้ว init ใหม่) อย่า push ไป repo เดิม |

เมื่อทำครบแล้ว การเปิดและใช้งานโปรเจกต์จากโฟลเดอร์โคลนจะไม่กระทบฐานข้อมูลเดิม Supabase และหน้าบ้าน Vercel ของต้นฉบับ

---

## สิ่งที่ต้องเตรียม

- **Node.js** (แนะนำ v18 ขึ้นไป) — [ดาวน์โหลด](https://nodejs.org/)
- **npm** (มาพร้อม Node.js)
- **Git** (ถ้าโคลนจาก Git) — [ดาวน์โหลด](https://git-scm.com/)
- **บัญชี Supabase** — [สมัคร](https://supabase.com/dashboard)
- **(ถ้าจะ Deploy)** บัญชี Vercel หรือ Netlify

---

## ขั้นตอนที่ 1: โคลนโปรเจกต์

### ตัวเลือก A: โคลนจาก Git

ถ้าโปรเจกต์อยู่บน GitHub / GitLab / Bitbucket:

```bash
git clone <URL ของ repo>
cd <ชื่อโฟลเดอร์โปรเจกต์>
```

ตัวอย่าง:
```bash
git clone https://github.com/your-username/app-rangsan.git
cd app-rangsan
```

### ตัวเลือก B: คัดลอกโฟลเดอร์

ถ้าได้โปรเจกต์เป็นโฟลเดอร์ (ZIP หรือ copy ทั้งโฟลเดอร์):

1. แตก ZIP หรือวางโฟลเดอร์ในตำแหน่งที่ต้องการ
2. เปิด Terminal / PowerShell แล้ว `cd` เข้าไปที่โฟลเดอร์นั้น

```powershell
cd "C:\path\to\App RANGSAN"
```

---

## ขั้นตอนที่ 2: ติดตั้ง Dependencies

รันคำสั่งเดียวในโฟลเดอร์โปรเจกต์:

```bash
npm install
```

หรือบน Windows PowerShell:

```powershell
npm install
```

รอจนติดตั้งครบ (จะได้โฟลเดอร์ `node_modules`)

---

## ขั้นตอนที่ 3: สร้างโปรเจกต์ Supabase และฐานข้อมูล

1. ไปที่ [Supabase Dashboard](https://supabase.com/dashboard) → **New Project**
2. ตั้งชื่อโปรเจกต์ เลือก Region ตั้งรหัสผ่าน Database แล้วกด **Create**
3. รอจนโปรเจกต์พร้อม เปิด **SQL Editor**

### รัน SQL สร้างตาราง (ตามลำดับที่แนะนำ — อัปเดตให้ตรงกับ repo ปัจจุบัน)

รันใน **Supabase → SQL Editor** ทีละไฟล์ตามลำดับ (คัดลอกเนื้อหาในไฟล์จากโฟลเดอร์โปรเจกต์ไปวางแล้วกด Run)

#### กลุ่ม A: ตารางเสริม + เครดิต + แจ้งเตือน (ในไฟล์เดียว)

| ลำดับ | ไฟล์ | หมายเหตุ |
|-------|------|----------|
| 1 | `sql/setup/SUPABASE_TABLES_SETUP.sql` | notifications, credit_transactions, user_credits, credit_usage_log ฯลฯ |

> ถ้ารันแล้ว **ไม่ต้อง** รัน `CREATE_NOTIFICATIONS_TABLE.sql` ที่รากโปรเจกต์ซ้ำ (เนื้อหาซ้ำซ้อนกับ setup)

#### กลุ่ม B: ฟีเจอร์หลัก (รากโปรเจกต์)

| ลำดับ | ไฟล์ |
|-------|------|
| 2 | `CREATE_PROMOTIONS_TABLE.sql` |
| 3 | `ADD_GETPRODUCTID_TO_PROMOTIONS.sql` |
| 4 | `CREATE_FRANCHISE_STOCK_TABLES.sql` |
| 5 | `CREATE_PURCHASE_ORDERS_TABLE_V2.sql` |
| 6 | `CREATE_STOCK_LOGS_TABLE.sql` |
| 7 | `CREATE_SETTINGS_TABLE.sql` |
| 8 | `CREATE_TAX_INVOICES_TABLE.sql` |
| 9 | `RECREATE_COUPONS_TABLE.sql` |

#### กลุ่ม C: setup / security เพิ่มเติม

| ลำดับ | ไฟล์ |
|-------|------|
| 10 | `sql/setup/CREATE_USER_APPROVALS_TABLE.sql` |
| 11 | `sql/setup/ADD_PRODUCTS_PRIMARY_KEY.sql` (ถ้ายังไม่มี PK บน products ตามที่แอปใช้) |
| 12 | `sql/setup/ADD_USERS_PRIMARY_KEY.sql` (ถ้าจำเป็นกับ schema ของคุณ) |
| 13 | `sql/security/FIX_ALL_RLS_FOR_CUSTOM_AUTH.sql` |
| 14 | `SUPABASE_TRIGGERS.sql` (ถ้าโปรเจกต์ใช้ trigger จากไฟล์นี้) |

#### กลุ่ม D: ฟีเจอร์ล่าสุด (ถ้าใช้งานในแอป)

| ลำดับ | ไฟล์ |
|-------|------|
| 15 | `docs/supplier_pin_locks.sql` | ล็อกซัพพลายด้วย PIN (แฟรนไชส์สั่งซัพอื่น) — รันเมื่อใช้ฟีเจอร์นี้ |

#### กลุ่ม E: migration ใน `supabase/migrations/` (อัปเดต schema ทีละขั้น)

หลังมีตารางหลัก (**users**, **products**, **order** ฯลฯ) ตามที่แอปคาดไว้แล้ว ให้รันไฟล์ใน `supabase/migrations/` **ตามชื่อไฟล์เรียงเวลา** (prefix `20250212...` → `20250621...`) หรือใช้ Supabase CLI:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

รายละเอียด CLI: **`docs/SUPABASE_CLI.md`**

งานเสริมใน migration ตัวอย่าง: primary key products/users, แก้ order เป็นตัวเลข, `other_supplier_products`, PO ซัพอื่น, storage RLS, ฯลฯ

---

**ตารางหลัก users / products / order:** ถ้าโปรเจกต์ของคุณยังไม่มี ให้สร้างตาม schema ที่แอปใช้ (ดู **DEPLOY.md**, **API_REFERENCE.md**) หรือ restore จาก backup ของทีม — จากนั้นค่อยรันกลุ่ม A–E ตามลำดับ

### สร้างผู้ใช้แอดมินแรก

แอปใช้ **custom auth** (ล็อกอินผ่านตาราง `users`) ต้องมีแถวในตาราง `users` ที่มี role เป็นแอดมิน เช่น:

- ใส่แถวผู้ใช้ผ่าน **Table Editor** → ตาราง **users**  
  หรือรัน SQL แบบนี้ (แก้ Email, Username, Password ให้ตรงที่ต้องการ):

```sql
-- ตัวอย่าง: สร้างแอดมิน (รหัสผ่านต้องเป็น hash จาก bcrypt ในแอป หรือใช้ฟอร์มลงทะเบียนแล้วแก้ role ในตาราง)
-- ถ้ามีฟอร์มลงทะเบียน: ลงทะเบียนในแอปก่อน แล้วมาแก้ Role ในตาราง users เป็น 'admin'
UPDATE users SET "Role" = 'admin' WHERE "Email" = 'your-admin@email.com';
```

---

## ขั้นตอนที่ 4: ตั้งค่า Environment Variables

**ถ้าโคลนโดยคัดลอกโฟลเดอร์:** อย่าใช้ `.env.local` ที่มากับโฟลเดอร์ต้นฉบับ (จะชี้ไปที่ฐานข้อมูลเดิม) — ต้องสร้าง `.env.local` ใหม่และใส่ค่าจากโปรเจกต์ **Supabase ใหม่** เท่านั้น (ดูหัวข้อด้านบน)

1. ในโฟลเดอร์โปรเจกต์ สร้างไฟล์ **`.env.local`** จาก template:

   **Windows (PowerShell):**
   ```powershell
   Copy-Item .env.example .env.local
   ```

   **macOS / Linux:**
   ```bash
   cp .env.example .env.local
   ```

2. เปิด Supabase Dashboard → โปรเจกต์ของคุณ → **Project Settings** (ไอคอนฟันเฟือง) → **API**
3. คัดลอกค่าไปใส่ใน `.env.local`:
   - **Project URL** → `VITE_SUPABASE_URL=...`
   - **anon public key** → `VITE_SUPABASE_KEY=...`

ตัวอย่าง (ห้ามใช้ค่าจริงจากเอกสารนี้ใน Git):

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

4. บันทึกไฟล์  
   - **ห้าม commit `.env.local`** ลง Git (ในโปรเจกต์มี `.gitignore` กันไว้แล้ว)

รายละเอียดเพิ่ม: **ENV_SETUP.md** · แม่แบบตัวแปร: **`.env.example`** (รากโปรเจกต์)

---

## ขั้นตอนที่ 5: รันแอปบนเครื่องตัวเอง

```bash
npm run dev
```

หรือ PowerShell:

```powershell
npm run dev
```

จากนั้นเปิดเบราว์เซอร์ไปที่ **http://localhost:3000** (ค่าเริ่มต้นใน `vite.config.js` — หรือพอร์ตที่แสดงในเทอร์มินัล)

- ลองลงทะเบียนหรือเข้าสู่ระบบด้วยบัญชีที่ตั้งไว้
- ถ้าเป็นแอดมิน ควรเข้าเมนูแอดมิน (Dashboard, จัดการสต็อก ฯลฯ) ได้

---

## ขั้นตอนที่ 6 (ถ้าต้องการ): Deploy ขึ้น Production

1. อัปโหลดโปรเจกต์ขึ้น Git (GitHub/GitLab) ถ้ายังไม่ได้ทำ
2. เชื่อม repo กับ [Vercel](https://vercel.com) หรือ [Netlify](https://netlify.com)
3. ตั้ง **Environment Variables** บน Vercel/Netlify:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_KEY`
4. ตั้งค่าใน Supabase → **Authentication** → **URL Configuration**:
   - **Site URL**: URL แอป production (เช่น `https://your-app.vercel.app`)
   - **Redirect URLs**: เพิ่ม `https://your-app.vercel.app/auth/callback` (ใช้ถ้ามี Google Sign-In)

รายละเอียดเต็ม: **DEPLOY.md**

---

## สรุปคำสั่ง (รันในโฟลเดอร์โปรเจกต์)

```bash
# 1. โคลน (ถ้าใช้ Git)
git clone <repo-url>
cd <โฟลเดอร์>

# 2. ติดตั้ง
npm install

# 3. ตั้งค่า .env.local (คัดลอกจาก .env.example แล้วใส่ค่า Supabase)

# 4. รันแอป
npm run dev
```

---

## เอกสารที่เกี่ยวข้อง

| ไฟล์ | ความหมาย |
|------|-----------|
| **README.md** (รากโปรเจกต์) | คำสั่ง `npm install` / `npm run dev` แบบสั้น |
| **ENV_SETUP.md** | รายละเอียดการตั้งค่า .env, Redirect URL, Google Sign-In |
| **DEPLOY.md** | Deploy Production, Database, Vercel/Netlify, Monitoring |
| **docs/README.md** | ดัชนีเอกสารทั้งหมด |
| **docs/SUPABASE_CLI.md** | ใช้ Supabase CLI ดูข้อมูล / push migration |
| **docs/PRODUCTID_REFERENCES.md** | ตารางที่อ้างอิง ProductID |
| **docs/API_REFERENCE.md** | ตารางและ service หลัก |

---

## หมายเหตุ

- **Windows PowerShell:** ถ้ารันคำสั่งต่อกันหลายคำสั่ง ใช้ `;` แทน `&&` (เช่น `cd path; npm install`)
- **ตารางใน Supabase:** ชื่อคอลัมน์บางตัวเป็น PascalCase (เช่น `ProductID`, `UserEmail`) ต้องตรงกับที่แอปใช้
- **Custom Auth:** แอปนี้ไม่ใช้ Supabase Auth เป็นหลัก แต่ใช้ตาราง `users` และล็อกอินเอง ดังนั้นไม่ต้องเปิด Email/Google Provider ใน Supabase ก็ได้ (เว้นแต่จะใช้ OAuth ตามที่กำหนดใน ENV_SETUP.md)
