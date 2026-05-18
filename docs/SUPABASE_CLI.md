# คู่มือ Supabase CLI

ใช้ Supabase CLI เพื่อ **ดูข้อมูลตาราง** และ **push การอัปเดต/แก้ไข** เข้าไปยังฐานข้อมูล (remote) ได้จากเครื่องคุณ

---

## 1. ติดตั้ง

**ตัวเลือก A: ใช้ผ่าน npx (ไม่ต้องติดตั้งในโปรเจกต์)**

```bash
npx supabase --version
```

**ตัวเลือก B: ติดตั้งเป็น devDependency ในโปรเจกต์**

```bash
npm install supabase --save-dev
```

จากนั้นรันด้วย `npx supabase` หรือเพิ่ม script ใน `package.json` เช่น `"supabase": "supabase"` แล้วใช้ `npm run supabase -- <คำสั่ง>`

---

## 2. เริ่มต้นโปรเจกต์ (ทำครั้งเดียว)

ถ้ายังไม่มีโฟลเดอร์ `supabase/`:

```bash
npx supabase init
```

จะได้โฟลเดอร์ `supabase/` พร้อม `config.toml` และจะสร้าง `supabase/migrations/` เมื่อมีการสร้าง migration ครั้งแรก

---

## 3. Login และ Link โปรเจกต์

### 3.1 Login

```bash
npx supabase login
```

จะเปิดเบราว์เซอร์ให้คุณใส่ **Personal Access Token**  
สร้างโทเค็นได้ที่: https://supabase.com/dashboard/account/tokens

### 3.2 Link กับโปรเจกต์บน Cloud

```bash
npx supabase link --project-ref <PROJECT_ID>
```

- **PROJECT_ID** คือค่าใน URL ของ Dashboard:  
  `https://supabase.com/dashboard/project/<project-id>`
- เมื่อ link แล้ว คำสั่งที่เกี่ยวกับ remote จะใช้โปรเจกต์นี้โดยอัตโนมัติ

---

## 4. ดูข้อมูลตาราง

### 4.1 ผ่าน Supabase Dashboard (แนะนำ)

- ไปที่ **Table Editor**: https://supabase.com/dashboard/project/<project-id>/editor  
- เลือกตารางแล้วดู/แก้ไขข้อมูลได้โดยตรง

### 4.2 ผ่าน CLI (dump ข้อมูล)

ดึงข้อมูล (data) ออกมาเป็น SQL หรือไฟล์:

```bash
# dump เฉพาะข้อมูล (ไม่รวม schema) ไปที่ stdout
npx supabase db dump --linked --data-only

# dump ไปยังไฟล์
npx supabase db dump --linked --data-only -f backup_data.sql
```

ดู schema (โครงสร้างตาราง) โดยไม่ใส่ `--data-only`:

```bash
npx supabase db dump --linked -f schema.sql
```

### 4.3 Error: ต้องใช้ Docker (Windows)

คำสั่ง `supabase db dump` และ `supabase db pull` รัน `pg_dump` **ภายใน Docker container** ดังนั้นบน Windows คุณอาจเจอ error แบบนี้:

```
failed to inspect docker image: error during connect: ... open //./pipe/docker_engine: The system cannot find the file specified.
Docker Desktop is a prerequisite for local development.
```

**สาเหตุ:** ไม่ได้ติดตั้ง Docker Desktop หรือติดตั้งแล้วแต่ยังไม่ได้เปิด (Docker daemon ไม่รัน)

**ทางเลือก (ไม่ต้องใช้ Docker):**

1. **ดูข้อมูลตาราง — ใช้ Supabase Dashboard (แนะนำ)**  
   ไปที่ **Table Editor**: `https://supabase.com/dashboard/project/<project-id>/editor` เลือกตารางแล้วดู/แก้ไขข้อมูลได้เลย ไม่ต้องใช้ CLI หรือ Docker

2. **Dump ข้อมูลด้วยตัวเอง (ถ้ามี PostgreSQL client ในเครื่อง)**  
   จาก Supabase Dashboard → **Settings** → **Database** คัดลอก **Connection string** (URI) แล้วใช้คำสั่ง `pg_dump` จากเครื่องคุณ:
   ```powershell
   pg_dump "postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres" --data-only -f backup_data.sql
   ```
   หรือใช้โปรแกรมเช่น **pgAdmin**, **DBeaver** ต่อกับ connection string นี้แล้ว export ข้อมูล

3. **ถ้าต้องการให้คำสั่ง CLI ใช้ได้ — ติดตั้งและเปิด Docker Desktop**  
   ดาวน์โหลด: https://docs.docker.com/desktop/install/windows-install/  
   หลังติดตั้งให้เปิด Docker Desktop แล้วรอจนสถานะ "Running" จากนั้นลองรัน `npx supabase db dump --linked --data-only` อีกครั้ง

**คำสั่งที่ต้องใช้ Docker:** `db dump`, `db pull`, `db diff`, `db lint` (เมื่อใช้กับ remote)  
**คำสั่งที่ไม่ต้องใช้ Docker:** `login`, `link`, `db push`, `migration new`, `migration list`

---

## 5. Push การอัปเดต/แก้ไข (Migration)

ใช้ **migrations** เพื่อให้การเปลี่ยน schema (สร้าง/แก้ไขตาราง, คอลัมน์, index ฯลฯ) ถูก push ขึ้น remote และเก็บเป็นประวัติ

### 5.1 สร้างไฟล์ migration ใหม่

```bash
npx supabase migration new <ชื่อภาษาอังกฤษ_เช่น_add_shipping_id>
```

จะได้ไฟล์ใน `supabase/migrations/` เช่น  
`supabase/migrations/20250212120000_add_shipping_id.sql`

### 5.2 เขียน SQL ในไฟล์ migration

เปิดไฟล์นั้นแล้วเขียนคำสั่ง SQL ที่ต้องการ เช่น:

```sql
-- ตัวอย่าง: เพิ่มคอลัมน์ id ใน shipping_rates
ALTER TABLE shipping_rates
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
```

### 5.3 Push ขึ้น remote

```bash
npx supabase db push --linked
```

หรือถ้า link ไว้แล้ว:

```bash
npx supabase db push
```

คำสั่งนี้จะรัน migration ที่ยังไม่ได้รันบน remote ตามลำดับเวลา

---

## 6. ดึง schema จาก remote มาเป็น migration (Pull)

ถ้าคุณแก้ไข schema บน Dashboard หรือที่อื่น และอยากให้ local กับ remote ตรงกัน:

```bash
npx supabase db pull --linked
```

จะสร้าง migration ใหม่จากความต่างของ schema ระหว่าง remote กับ local

---

## สรุปคำสั่งที่ใช้บ่อย

| งาน | คำสั่ง |
|-----|--------|
| ดูเวอร์ชัน CLI | `npx supabase --version` |
| Login | `npx supabase login` |
| Link โปรเจกต์ | `npx supabase link --project-ref <PROJECT_ID>` |
| ดูข้อมูลตาราง (dump) | `npx supabase db dump --linked --data-only` |
| Push การแก้ไข | สร้าง migration → แก้ไฟล์ SQL → `npx supabase db push --linked` |
| ดึง schema จาก remote | `npx supabase db pull --linked` |

---

## หมายเหตุสำหรับ Windows / PowerShell

บน PowerShell อย่าใช้ `&&` ในการต่อคำสั่ง ให้ใช้ `;` แทน:

```powershell
cd "c:\Users\sawarin\Desktop\App RANGSAN"; npx supabase init
```

---

## โปรเจกต์นี้

- มีโฟลเดอร์ `supabase/` และ `supabase/config.toml` แล้ว (จาก `supabase init`)
- มี SQL ตั้งค่า/แก้ไขตารางใน `sql/` และ `sql/setup/` (เช่น `ADD_PRODUCTS_PRIMARY_KEY.sql`, การเพิ่ม `id` ให้ `shipping_rates`) — ถ้าต้องการให้จัดการผ่าน CLI สามารถคัดลอกหรืออ้างอิง SQL เหล่านั้นใน `supabase/migrations/` แล้วใช้ `supabase db push --linked`
