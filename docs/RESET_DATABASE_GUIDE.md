# คู่มือการล้างข้อมูลและรีเซ็ตฐานข้อมูล

## 📋 สรุป

คู่มือนี้จะช่วยคุณล้างข้อมูลทั้งหมดในฐานข้อมูลเพื่อเริ่มทดสอบระบบใหม่ โดยไม่ลบโครงสร้างตาราง

## ⚠️ คำเตือน

- **ข้อมูลทั้งหมดจะถูกลบ** - ไม่สามารถกู้คืนได้
- **โครงสร้างตารางจะยังคงอยู่** - Columns, Indexes, Constraints จะไม่ถูกลบ
- **RLS Policies จะยังคงอยู่** - Row Level Security policies จะไม่ถูกลบ

## 🚀 ขั้นตอนการใช้งาน

### Step 1: สำรองข้อมูล (ถ้าต้องการ)

ถ้าคุณต้องการเก็บข้อมูลไว้ ควร export ก่อน:

```sql
-- Export ข้อมูลจากตารางสำคัญ (ตัวอย่าง)
COPY users TO '/path/to/backup/users.csv' WITH CSV HEADER;
COPY products TO '/path/to/backup/products.csv' WITH CSV HEADER;
COPY "order" TO '/path/to/backup/orders.csv' WITH CSV HEADER;
```

### Step 2: ล้างข้อมูลทั้งหมด

1. เปิด Supabase Dashboard → SQL Editor
2. เปิดไฟล์ `CLEAR_ALL_DATA.sql`
3. Copy และ Paste ลงใน SQL Editor
4. **ตรวจสอบให้แน่ใจว่าไม่มีข้อมูลสำคัญที่ต้องการเก็บไว้**
5. รัน SQL Script
6. ตรวจสอบว่าไม่มี Error

### Step 3: สร้าง Admin User ใหม่

1. เปิด Supabase Dashboard → SQL Editor
2. เปิดไฟล์ `CREATE_ADMIN_USER.sql`
3. **แก้ไขข้อมูล Admin User (ถ้าต้องการ):**
   - Email: `admin@gmail.com`
   - Password: `Admin2025` (ควรเปลี่ยนเป็นรหัสที่ปลอดภัยกว่า)
   - Username: `Admin RANGSAN`
   - Phone, Address: แก้ไขตามต้องการ
4. Copy และ Paste ลงใน SQL Editor
5. รัน SQL Script
6. ตรวจสอบว่าสร้างสำเร็จ

### Step 4: ทดสอบการ Login

1. เปิดหน้าเว็บ `/login`
2. Login ด้วย:
   - **Email:** `admin@gmail.com`
   - **Password:** `Admin2025`
3. ตรวจสอบว่า Login สำเร็จและเข้าสู่ระบบ Admin ได้

### Step 5: เปลี่ยนรหัสผ่าน (แนะนำ)

1. หลังจาก Login สำเร็จ ไปที่หน้า Profile
2. เปลี่ยนรหัสผ่านเป็นรหัสที่ปลอดภัยกว่า
3. หรือใช้หน้า Admin เพื่อเปลี่ยนรหัสผ่าน

## 📝 ตารางที่ถูกลบข้อมูล

### ตารางหลัก:
- ✅ `users` - ข้อมูลผู้ใช้ทั้งหมด
- ⚠️ `products` - **ข้อมูลสินค้าจะยังคงอยู่** (ไม่ถูกลบ)

**หมายเหตุ:** ถ้าต้องการลบข้อมูลสินค้าด้วย ให้ใช้ `CLEAR_ALL_DATA.sql` แทน

### ตารางที่อ้างอิง:
- ✅ `order` - ออเดอร์ทั้งหมด
- ✅ `credit_transactions` - ประวัติการเติมเครดิต
- ✅ `user_credits` - ยอดเครดิตผู้ใช้
- ✅ `credit_usage_log` - ประวัติการใช้เครดิต
- ✅ `notifications` - การแจ้งเตือน
- ✅ `tax_invoices` - ใบกำกับภาษี
- ✅ `purchase_orders` - PO ทั้งหมด
- ✅ `po_items` - รายการ PO
- ✅ `stock_logs` - ประวัติสต็อก
- ✅ `franchise_stock` - สต็อกแฟรนไชส์
- ✅ `franchise_stock_logs` - ประวัติสต็อกแฟรนไชส์
- ✅ `user_approvals` - คำขออนุมัติ UserType

### ตารางอื่นๆ:
- ✅ `coupons` - คูปอง
- ✅ `shipping_rates` - อัตราค่าจัดส่ง
- ✅ `settings` - ตั้งค่าระบบ
- ✅ `suppliers` - ซัพพลายเออร์

## 🔐 ข้อมูล Admin User เริ่มต้น

หลังจากรัน `CREATE_ADMIN_USER.sql`:

- **Email:** `admin@gmail.com`
- **Password:** `Admin2025`
- **Username:** `Admin RANGSAN`
- **Role:** `admin`
- **UserType:** `regular`

## ✅ ตรวจสอบผลลัพธ์

### ตรวจสอบว่าข้อมูลถูกลบแล้ว:

```sql
-- ตรวจสอบจำนวน records ในตาราง
SELECT 
  'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'order', COUNT(*) FROM "order"
UNION ALL
SELECT 'credit_transactions', COUNT(*) FROM credit_transactions;
```

ผลลัพธ์ควรเป็น:
- `users`: 0 หรือ 1 (ถ้าสร้าง admin แล้ว)
- `products`: 0
- `order`: 0
- `credit_transactions`: 0

### ตรวจสอบ Admin User:

```sql
SELECT Email, Username, Role, UserType 
FROM users 
WHERE Email = 'admin@gmail.com';
```

## 🎯 ขั้นตอนต่อไป

หลังจากล้างข้อมูลและสร้าง Admin User แล้ว:

1. **ทดสอบการ Login** ด้วย admin account
2. **เพิ่มสินค้า** ผ่านหน้า Admin → จัดการสต็อก
3. **ทดสอบการสมัครสมาชิก** ผ่านหน้า Register
4. **ทดสอบระบบอื่นๆ** ตามต้องการ

## ⚠️ ข้อควรระวัง

1. **ไม่สามารถกู้คืนข้อมูลได้** - หลังจากลบแล้ว
2. **ควรสำรองข้อมูลก่อน** - ถ้ามีข้อมูลสำคัญ
3. **ทดสอบใน Development** - ไม่ควรทำใน Production
4. **เปลี่ยนรหัสผ่าน Admin** - หลังจากสร้างแล้ว

## 📌 หมายเหตุ

- Script นี้ใช้ `TRUNCATE` ซึ่งเร็วกว่า `DELETE` และ reset auto-increment
- `CASCADE` จะลบข้อมูลจากตารางที่อ้างอิงด้วย
- โครงสร้างตาราง (columns, indexes, constraints) จะยังคงอยู่
- RLS Policies จะยังคงอยู่
