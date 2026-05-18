# คู่มือการใช้งานระบบสมัครสมาชิกและอนุมัติ UserType

## 📋 สรุป

ระบบใหม่ที่เพิ่มเข้ามา:
1. **หน้า Register** - สำหรับสมัครสมาชิกใหม่
2. **หน้า Admin User Approval** - สำหรับ Admin อนุมัติการเปลี่ยน UserType
3. **ฟังก์ชันร้องขอเปลี่ยน UserType** - ในหน้า Profile

## 🚀 ขั้นตอนการใช้งาน

### 1. สร้างตารางและเพิ่ม Primary Key

#### 1.1 เพิ่ม Primary Key ให้ตาราง users
```sql
-- รันใน Supabase SQL Editor
-- ไฟล์: ADD_USERS_PRIMARY_KEY.sql
```

#### 1.2 สร้างตาราง user_approvals
```sql
-- รันใน Supabase SQL Editor
-- ไฟล์: CREATE_USER_APPROVALS_TABLE.sql
```

### 2. ทดสอบระบบสมัครสมาชิก

1. ไปที่หน้า `/register`
2. กรอกข้อมูล:
   - อีเมล (ต้องเป็น email ที่ถูกต้อง)
   - ชื่อผู้ใช้ (อย่างน้อย 3 ตัวอักษร)
   - รหัสผ่าน (อย่างน้อย 8 ตัวอักษร, ต้องมีตัวอักษรใหญ่, ตัวอักษรเล็ก, และตัวเลข)
   - ยืนยันรหัสผ่าน
   - เบอร์โทรศัพท์ (ไม่บังคับ)
   - ที่อยู่ (ไม่บังคับ)
3. กด "สมัครสมาชิก"
4. ระบบจะตรวจสอบ:
   - Email ซ้ำหรือไม่
   - Password ตรงกันหรือไม่
   - Password ตรงตามเงื่อนไขหรือไม่
5. หลังจากสมัครสำเร็จ จะถูก redirect ไปหน้า Login

### 3. ทดสอบการร้องขอเปลี่ยน UserType

1. Login ด้วย user account (regular)
2. ไปที่หน้า Profile
3. ในส่วน "ประเภทลูกค้า" จะมีปุ่ม "ร้องขอเป็น Franchise"
4. กดปุ่มและกรอกหมายเหตุ (ไม่บังคับ)
5. ระบบจะสร้างคำขอในตาราง `user_approvals`
6. ผู้ใช้จะเห็นสถานะ "รออนุมัติ"

### 4. ทดสอบการอนุมัติ UserType (Admin)

1. Login ด้วย admin account
2. ไปที่หน้า "อนุมัติ UserType" ใน Sidebar
3. จะเห็นรายการผู้ใช้ที่ร้องขออนุมัติ
4. Admin สามารถ:
   - **อนุมัติ** - เปลี่ยน UserType เป็น 'franchise' และแจ้งเตือนผู้ใช้
   - **ปฏิเสธ** - ปฏิเสธคำขอและแจ้งเตือนผู้ใช้
5. หลังจากอนุมัติ/ปฏิเสธ ผู้ใช้จะได้รับการแจ้งเตือน

## 🔐 ความปลอดภัย

### ข้อดีของระบบใหม่:

1. **Email Verification Ready**
   - ใช้ Email เป็นหลักในการยืนยันตัวตน
   - สามารถเพิ่ม Email Verification ได้ในอนาคต

2. **Password Policy**
   - ความยาวขั้นต่ำ 8 ตัวอักษร
   - ต้องมีตัวอักษรใหญ่, ตัวอักษรเล็ก, และตัวเลข
   - ตรวจสอบ Password ที่ใช้บ่อย

3. **Admin Approval**
   - Admin เป็นผู้อนุมัติการเปลี่ยน UserType
   - มีระบบแจ้งเตือนผู้ใช้
   - มีประวัติการอนุมัติ

4. **การเชื่อมต่อข้อมูล**
   - ใช้ **Email** เป็น Primary Identifier
   - ใช้ **Username** สำหรับการแสดงผล
   - ใช้ **BranchId** สำหรับ Franchise users
   - ใช้ **ProductID** และ **ProductName** สำหรับสินค้า

### ข้อควรระวัง:

1. **Password Hashing**
   - ⚠️ ตอนนี้ Password ยังเก็บเป็น plain text
   - ควรเพิ่ม Password Hashing (bcrypt หรือ argon2) ในอนาคต

2. **Email Verification**
   - ⚠️ ยังไม่มีระบบยืนยัน Email
   - ควรเพิ่ม Email Verification ในอนาคต

3. **Rate Limiting**
   - ⚠️ ยังไม่มีระบบจำกัดจำนวนครั้งในการสมัคร/Login
   - ควรเพิ่ม Rate Limiting ในอนาคต

## 📝 ไฟล์ที่สร้าง

### Frontend:
- `src/pages/Register.jsx` - หน้าสมัครสมาชิก
- `src/pages/AdminUserApproval.jsx` - หน้าอนุมัติ UserType (Admin)
- `src/pages/Profile.jsx` - เพิ่มฟังก์ชันร้องขอเปลี่ยน UserType

### Backend (SQL):
- `CREATE_USER_APPROVALS_TABLE.sql` - สร้างตาราง user_approvals
- `ADD_USERS_PRIMARY_KEY.sql` - เพิ่ม Primary Key ให้ตาราง users

### Documentation:
- `SECURITY_IMPROVEMENTS_PLAN.md` - แผนปรับปรุงความปลอดภัย
- `IMPLEMENTATION_GUIDE.md` - คู่มือการใช้งาน (ไฟล์นี้)

## 🎯 สรุป

### ความปลอดภัยที่เพิ่มขึ้น:
1. ✅ ระบบสมัครสมาชิกที่ปลอดภัย
2. ✅ Password Policy
3. ✅ Admin Approval สำหรับ UserType
4. ✅ การเชื่อมต่อข้อมูลที่ชัดเจน (Email, Username, BranchId, ProductID)

### สิ่งที่ควรทำต่อไป:
1. ⚠️ เพิ่ม Password Hashing
2. ⚠️ เพิ่ม Email Verification
3. ⚠️ เพิ่ม Rate Limiting
4. ⚠️ เพิ่ม CAPTCHA สำหรับการป้องกัน bot

## 📌 หมายเหตุ

- **ข้อมูลเดิม:** ข้อมูลเดิมจะไม่หายไป แต่ควรเพิ่ม Primary Key ให้ตาราง users
- **Migration:** ต้องทำ migration อย่างระมัดระวัง
- **Testing:** ทดสอบทุกฟีเจอร์ก่อน deploy production
