# แก้ไขปัญหา RLS Policy สำหรับ Storage Bucket

## ปัญหา
เมื่ออัปโหลดรูปภาพ (เช่น รูปสินค้าในหน้าจัดการสต็อก หรือสลิปโอนเงิน) เกิด error บางครั้ง:
```
new row violates row-level security policy
```

## สาเหตุ
- Supabase Storage ต้องมี RLS policy ชัดเจนสำหรับแต่ละ bucket ถึงจะอัปโหลดได้
- Bucket `product-images` (รูปสินค้า) เดิมไม่มี policy สำหรับ INSERT
- Bucket `order-slips` (สลิป/ลายเซ็น) อาจยังไม่ได้ตั้ง policy หรือ session ยังไม่พร้อมตอนอัปโหลด

## วิธีแก้ไข (อัตโนมัติด้วย Migration)

โปรเจกต์มี migration ที่ตั้งค่า RLS ให้แล้ว:

- **ไฟล์:** `supabase/migrations/20250617000000_storage_rls_product_images_order_slips.sql`
- **Bucket ที่ตั้งแล้ว:** `product-images` (รูปสินค้า), `order-slips` (สลิป/ลายเซ็น)
- **การทำงาน:** อนุญาตให้ผู้ใช้ที่ login (authenticated) อัปโหลดได้ และให้ทุกคนอ่านได้ตามที่กำหนด

รัน migration (ถ้ายังไม่ได้รัน):
```bash
npx supabase db push --include-all
```

ในโค้ดได้เพิ่มการรอ session ก่อนอัปโหลดใน `imageService.js` เพื่อลดโอกาส error ตอน token ยังไม่โหลด (เช่น เปิดหน้าแล้วกดอัปโหลดทันที)

---

## วิธีแก้ไขด้วยมือ (ถ้าต้องการแก้ใน Dashboard)

### 1. เปิด Supabase Dashboard
- ไปที่ [Supabase Dashboard](https://app.supabase.com)
- เลือกโปรเจคของคุณ

### 2. ตั้งค่า Storage Bucket Policy

#### ขั้นตอนที่ 1: ตรวจสอบ Bucket
1. ไปที่ **Storage** ในเมนูด้านซ้าย
2. ตรวจสอบว่ามี bucket ชื่อ `order-slips` หรือไม่
3. ถ้ายังไม่มี ให้สร้าง bucket ใหม่:
   - คลิก **New bucket**
   - ตั้งชื่อ: `order-slips`
   - เลือก **Public bucket** (ถ้าต้องการให้เข้าถึงได้โดยไม่ต้อง login)
   - หรือเลือก **Private bucket** (ถ้าต้องการให้ต้อง login ก่อน)

#### ขั้นตอนที่ 2: ตั้งค่า RLS Policy สำหรับ Upload

1. คลิกที่ bucket `order-slips`
2. ไปที่แท็บ **Policies**
3. คลิก **New Policy**

##### Policy 1: อนุญาตให้ผู้ใช้ authenticated อัปโหลดไฟล์ได้

**Policy Name:** `Allow authenticated users to upload`
**Allowed Operation:** `INSERT`
**Policy Definition:**
```sql
(bucket_id = 'order-slips'::text) AND (auth.role() = 'authenticated')
```

**Target roles:** `authenticated`

##### Policy 2: อนุญาตให้ผู้ใช้ authenticated อ่านไฟล์ได้

**Policy Name:** `Allow authenticated users to read`
**Allowed Operation:** `SELECT`
**Policy Definition:**
```sql
(bucket_id = 'order-slips'::text) AND (auth.role() = 'authenticated')
```

**Target roles:** `authenticated`

##### Policy 3: อนุญาตให้ผู้ใช้ authenticated อัปเดตไฟล์ของตัวเองได้ (ถ้าต้องการ)

**Policy Name:** `Allow users to update their own files`
**Allowed Operation:** `UPDATE`
**Policy Definition:**
```sql
(bucket_id = 'order-slips'::text) AND (auth.role() = 'authenticated') AND (auth.email() = (storage.foldername(name))[1])
```

**Target roles:** `authenticated`

**หมายเหตุ:** Policy นี้จะอนุญาตให้ผู้ใช้แก้ไขไฟล์ในโฟลเดอร์ของตัวเองเท่านั้น (ตามที่เราใช้ `userEmail` ในการสร้าง path)

##### Policy 4: อนุญาตให้ผู้ใช้ authenticated ลบไฟล์ของตัวเองได้ (ถ้าต้องการ)

**Policy Name:** `Allow users to delete their own files`
**Allowed Operation:** `DELETE`
**Policy Definition:**
```sql
(bucket_id = 'order-slips'::text) AND (auth.role() = 'authenticated') AND (auth.email() = (storage.foldername(name))[1])
```

**Target roles:** `authenticated`

### 3. ตั้งค่า RLS Policy แบบง่าย (ถ้าต้องการให้ทุกคนที่ login ได้)

ถ้าต้องการให้ผู้ใช้ authenticated ทุกคนสามารถอัปโหลดและอ่านไฟล์ได้โดยไม่จำกัด:

**INSERT Policy:**
```sql
bucket_id = 'order-slips'::text AND auth.role() = 'authenticated'
```

**SELECT Policy:**
```sql
bucket_id = 'order-slips'::text AND auth.role() = 'authenticated'
```

### 4. ตรวจสอบการตั้งค่า

หลังจากตั้งค่า policy แล้ว:
1. ลอง login ด้วย Google OAuth
2. ลองอัปโหลดสลิปโอนเงินในหน้า checkout
3. ตรวจสอบว่าไม่มี error แล้ว

## หมายเหตุสำคัญ

1. **Google OAuth Users:** ผู้ใช้ที่ login ด้วย Google OAuth จะมี `auth.role() = 'authenticated'` เหมือนกับผู้ใช้ที่ login ด้วย email/password
2. **File Path Structure:** เราใช้ `userEmail` ในการสร้าง path (`userEmail/filename`) เพื่อให้ง่ายต่อการจัดการและตรวจสอบสิทธิ์
3. **Public vs Private:** ถ้า bucket เป็น public ไฟล์จะเข้าถึงได้โดยไม่ต้อง login แต่ถ้าเป็น private ต้อง login ก่อน

## การแก้ไขที่ทำไปแล้วในโค้ด

1. ✅ แก้ไข `imageService.js` ให้รับ `userEmail` parameter และใช้ในการสร้าง path
2. ✅ แก้ไข `Checkout.jsx` ให้ส่ง `user?.email` ไปยัง `uploadOrderSlip`
3. ✅ แก้ไข `creditService.js` ให้ส่ง `userEmail` ไปยัง `uploadOrderSlip`
4. ✅ เพิ่ม input field ใน `Cart.jsx` เพื่อให้แก้ไขจำนวนได้โดยตรง

## ถ้ายังมีปัญหา

1. ตรวจสอบว่า Supabase Auth ทำงานถูกต้อง:
   - ไปที่ **Authentication** > **Users**
   - ตรวจสอบว่าผู้ใช้ Google OAuth มีสถานะ `confirmed` หรือไม่

2. ตรวจสอบ Storage Bucket:
   - ไปที่ **Storage** > **order-slips**
   - ตรวจสอบว่า bucket มีอยู่และตั้งค่า RLS policy แล้ว

3. ตรวจสอบ Console Log:
   - เปิด Developer Tools (F12)
   - ดู Console tab สำหรับ error messages เพิ่มเติม

4. ตรวจสอบ Network Tab:
   - ดู Network requests ว่ามี error 400 หรือ 403 หรือไม่
   - ตรวจสอบ response body สำหรับ error details
