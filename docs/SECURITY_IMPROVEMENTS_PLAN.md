# แผนปรับปรุงความปลอดภัยของแอปพลิเคชัน

## 📋 สรุปปัญหาและข้อเสนอแนะ

### 🔴 ปัญหาปัจจุบัน

1. **ไม่มีระบบสมัครใช้งาน (Registration)**
   - ผู้ใช้ต้องถูกสร้างโดย Admin เท่านั้น
   - ไม่มีกระบวนการยืนยันตัวตน

2. **UserType ถูกตั้งค่าตรงๆ โดยไม่มีกระบวนการอนุมัติ**
   - ไม่มีการตรวจสอบความถูกต้อง
   - อาจเกิดการตั้งค่า UserType ผิดพลาด

3. **ความปลอดภัยของข้อมูล**
   - Password เก็บเป็น plain text (ไม่มีการ hash)
   - ไม่มีการยืนยัน Email
   - ไม่มีระบบป้องกันการ brute force

### ✅ ข้อเสนอแนะ

1. **เพิ่มระบบสมัครใช้งาน (Registration)**
   - ใช้ Email เป็นหลักในการยืนยันตัวตน
   - ส่ง Email ยืนยัน (Email Verification)
   - Hash Password ก่อนเก็บในฐานข้อมูล

2. **ระบบ Admin Approval สำหรับ UserType**
   - ผู้ใช้สมัครเป็น 'regular' โดย default
   - Admin เป็นผู้อนุมัติการเปลี่ยน UserType เป็น 'franchise'
   - มีหน้า Admin สำหรับจัดการการอนุมัติ

3. **การเชื่อมต่อข้อมูลระหว่างตาราง**
   - ใช้ **Email** เป็น Primary Key หรือ Unique Identifier
   - ใช้ **Username** สำหรับการแสดงผล
   - ใช้ **BranchId** สำหรับ Franchise users
   - ใช้ **ProductID** และ **ProductName** สำหรับสินค้า

## 🏗️ โครงสร้างที่แนะนำ

### 1. ตาราง `users` - ควรมี Primary Key

```sql
-- แนะนำให้เพิ่ม Primary Key
ALTER TABLE users ADD COLUMN IF NOT EXISTS id BIGSERIAL PRIMARY KEY;

-- หรือใช้ Email เป็น Primary Key (ถ้า Email เป็น unique)
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (Email);
```

### 2. การเชื่อมต่อข้อมูลระหว่างตาราง

#### ตารางที่ใช้ Email:
- `order` → `UserEmail`
- `credit_transactions` → `useremail`
- `user_credits` → `useremail`
- `credit_usage_log` → `useremail`
- `notifications` → `useremail`
- `tax_invoices` → `useremail`

#### ตารางที่ใช้ BranchId:
- `franchise_stock` → `branchid`
- `franchise_stock_logs` → `branchid`
- `purchase_orders` → `branchid` (สำหรับ franchise POs)

#### ตารางที่ใช้ ProductID/ProductName:
- `products` → `ProductID` (Primary Key), `ProductName`
- `order` → `ProductID` (ใน items)
- `po_items` → `productid`, `productname`
- `franchise_stock` → `productid`, `productname`
- `stock_logs` → `productid`, `productname`

## 🔐 แผนการปรับปรุงความปลอดภัย

### Phase 1: ระบบสมัครใช้งาน (Registration)

#### 1.1 สร้างหน้า Register
- ฟอร์มสมัครสมาชิก
- ตรวจสอบ Email ซ้ำ
- ตรวจสอบความแข็งแรงของ Password
- ยืนยัน Password

#### 1.2 Email Verification
- ส่ง Email ยืนยันหลังจากสมัคร
- ต้องยืนยัน Email ก่อนใช้งาน
- เก็บสถานะ `email_verified` ในตาราง users

#### 1.3 Password Hashing
- Hash Password ด้วย bcrypt หรือ argon2
- ไม่เก็บ Password เป็น plain text
- ตรวจสอบ Password ด้วย hash comparison

### Phase 2: ระบบ Admin Approval

#### 2.1 ตาราง `user_approvals` (ใหม่)
```sql
CREATE TABLE IF NOT EXISTS user_approvals (
  id BIGSERIAL PRIMARY KEY,
  useremail TEXT NOT NULL REFERENCES users(Email),
  requested_usertype TEXT NOT NULL DEFAULT 'franchise',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  admin_email TEXT,
  admin_notes TEXT,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewedat TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (useremail) REFERENCES users(Email)
);
```

#### 2.2 หน้า Admin สำหรับอนุมัติ
- แสดงรายการผู้ใช้ที่ร้องขออนุมัติ
- Admin สามารถอนุมัติหรือปฏิเสธ
- ระบบแจ้งเตือนผู้ใช้เมื่อได้รับการอนุมัติ

### Phase 3: การปรับปรุงความปลอดภัย

#### 3.1 Password Policy
- ความยาวขั้นต่ำ 8 ตัวอักษร
- ต้องมีตัวอักษรใหญ่, ตัวอักษรเล็ก, ตัวเลข
- ตรวจสอบ Password ที่ใช้บ่อย (common passwords)

#### 3.2 Rate Limiting
- จำกัดจำนวนครั้งในการ Login
- จำกัดจำนวนครั้งในการสมัคร
- ใช้ CAPTCHA สำหรับการป้องกัน bot

#### 3.3 Session Management
- ใช้ JWT Token หรือ Session Token
- ตั้งค่า Session Timeout
- Logout อัตโนมัติเมื่อไม่ใช้งาน

## 📝 ขั้นตอนการพัฒนา

### Step 1: เพิ่ม Primary Key ให้ตาราง users
```sql
-- ตรวจสอบว่ามี Primary Key หรือไม่
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'users' AND constraint_type = 'PRIMARY KEY';

-- ถ้าไม่มี ให้เพิ่ม
ALTER TABLE users ADD COLUMN IF NOT EXISTS id BIGSERIAL PRIMARY KEY;
```

### Step 2: สร้างหน้า Register
- สร้างไฟล์ `src/pages/Register.jsx`
- เพิ่ม route ใน `App.jsx`
- เชื่อมต่อกับ Supabase

### Step 3: สร้างระบบ Admin Approval
- สร้างตาราง `user_approvals`
- สร้างหน้า Admin สำหรับอนุมัติ
- เพิ่มการแจ้งเตือน

### Step 4: ปรับปรุงความปลอดภัย
- Hash Password
- Email Verification
- Rate Limiting

## 🎯 สรุป

### ความปลอดภัยที่เพิ่มขึ้น:
1. ✅ ระบบสมัครใช้งานที่ปลอดภัย
2. ✅ Email Verification
3. ✅ Password Hashing
4. ✅ Admin Approval สำหรับ UserType
5. ✅ การเชื่อมต่อข้อมูลที่ชัดเจน (Email, Username, BranchId, ProductID)

### การเชื่อมต่อข้อมูล:
- **Email** → Primary Identifier สำหรับ Users
- **Username** → สำหรับการแสดงผล
- **BranchId** → สำหรับ Franchise users
- **ProductID** → Primary Key สำหรับ Products
- **ProductName** → สำหรับการแสดงผลและค้นหา

## 📌 หมายเหตุ

- **ข้อมูลเดิม:** ข้อมูลเดิมจะไม่หายไป แต่ควรเพิ่ม Primary Key ให้ตาราง users
- **Migration:** ต้องทำ migration อย่างระมัดระวัง
- **Testing:** ทดสอบทุกฟีเจอร์ก่อน deploy production
