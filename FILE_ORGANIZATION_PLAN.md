# แผนการจัดระเบียบไฟล์

## ✅ สถานะการดำเนินการ

- **จัดโฟลเดอร์แล้ว:** สร้าง `sql/setup`, `sql/security`, `sql/maintenance`, `sql/verify` และ `docs` แล้วย้ายไฟล์ตามรายการด้านล่าง
- **ไม่มีการลบไฟล์:** รายการ "ควรลบ" ในแผนส่วนใหญ่ไม่มีอยู่ในโปรเจกต์ จึงไม่ได้ลบ (ไม่มีผลกระทบต่อการรันแอป)
- **ไฟล์ใน `src/` ไม่ได้อ้างอิง .sql หรือ .md เหล่านี้** ดังนั้นการย้ายไม่กระทบการ build หรือรันแอป

---

## 📋 ไฟล์ที่ควรเก็บไว้ (ไฟล์สำคัญ)

### SQL Scripts - ใช้งานจริง
1. **FIX_ALL_RLS_FOR_CUSTOM_AUTH.sql** ⭐ - ปิด RLS สำหรับทุกตาราง (ไฟล์หลัก)
2. **ADD_DATABASE_CONSTRAINTS.sql** ⭐ - เพิ่ม constraints เพื่อความปลอดภัย
3. **RESET_AND_CREATE_ADMIN_KEEP_PRODUCTS.sql** ⭐ - Reset database และสร้าง admin (แนะนำ)
4. **CHANGE_REGISTEREDDATE_TO_TIMESTAMP.sql** ⭐ - เปลี่ยน type ของ RegisteredDate
5. **CREATE_USER_APPROVALS_TABLE.sql** ⭐ - สร้างตาราง user_approvals
6. **ADD_USERS_PRIMARY_KEY.sql** ⭐ - เพิ่ม primary key ให้ users table
7. **SUPABASE_TABLES_SETUP.sql** ⭐ - สร้างตารางทั้งหมด (ถ้ายังไม่มี)

### SQL Scripts - ตรวจสอบ/ทดสอบ
8. **CHECK_RLS_STATUS.sql** - ตรวจสอบสถานะ RLS
9. **VERIFY_ALL_CONSTRAINTS.sql** - ตรวจสอบ constraints
10. **CHECK_DUPLICATE_EMAILS.sql** - ตรวจสอบ email ซ้ำ

### Documentation - สำคัญ
11. **PROJECT_STATUS.md** ⭐ - สถานะโปรเจค
12. **RLS_DISABLED_SECURITY_ANALYSIS.md** - วิเคราะห์ความปลอดภัย
13. **RLS_SECURITY_RECOMMENDATIONS.md** - คำแนะนำความปลอดภัย
14. **RESET_DATABASE_GUIDE.md** - คู่มือ reset database
15. **SECURITY_IMPROVEMENTS_PLAN.md** - แผนปรับปรุงความปลอดภัย

## 🗑️ ไฟล์ที่ควรลบ (ไฟล์ซ้ำซ้อน/ไม่ได้ใช้)

### SQL Scripts - ซ้ำซ้อน
- `FIX_CREDIT_RLS_ISSUE.sql` - ซ้ำกับ `DISABLE_RLS_FOR_CREDIT_TABLES.sql`
- `FIX_CREDIT_RLS_CUSTOM_AUTH.sql` - ซ้ำกับ `FIX_ALL_RLS_FOR_CUSTOM_AUTH.sql`
- `FIX_CREDIT_RLS.sql` - ซ้ำกับ `FIX_ALL_RLS_FOR_CUSTOM_AUTH.sql`
- `DISABLE_RLS_FOR_CREDIT_TABLES.sql` - รวมอยู่ใน `FIX_ALL_RLS_FOR_CUSTOM_AUTH.sql`
- `DISABLE_RLS_FOR_PRODUCTS.sql` - รวมอยู่ใน `FIX_ALL_RLS_FOR_CUSTOM_AUTH.sql`
- `FIX_RLS_FOR_CUSTOM_AUTH.sql` - ซ้ำกับ `FIX_ALL_RLS_FOR_CUSTOM_AUTH.sql`
- `FIX_PRODUCTS_RLS.sql` - ไม่ใช้แล้ว (ปิด RLS แทน)
- `ADD_UNIQUE_EMAIL_CONSTRAINT.sql` - รวมอยู่ใน `ADD_DATABASE_CONSTRAINTS.sql`
- `CHECK_CREDIT_USAGE_LOG_COLUMNS.sql` - ใช้ครั้งเดียวแล้ว
- `CHECK_ALL_RLS_STATUS.sql` - ซ้ำกับ `CHECK_RLS_STATUS.sql`
- `VIEW_CHECK_CONSTRAINTS_DETAILS.sql` - ใช้ครั้งเดียวแล้ว

### SQL Scripts - RLS Policies เก่า (ไม่ใช้แล้ว)
- `SUPABASE_RLS_POLICIES.sql` - เก่า (ไม่ใช้แล้ว - ใช้ปิด RLS แทน)
- `SUPABASE_RLS_POLICIES_COMPLETE.sql` - เก่า (ไม่ใช้แล้ว - ใช้ปิด RLS แทน)
- `SUPABASE_RLS_POLICIES_FINAL.sql` - เก่า (ไม่ใช้แล้ว)
- `SUPABASE_RLS_POLICIES_FIXED.sql` - เก่า (ไม่ใช้แล้ว)
- `SUPABASE_RLS_POLICIES_READY_TO_RUN.sql` - เก่า (ไม่ใช้แล้ว)
- `SUPABASE_RLS_POLICIES_SIMPLE.sql` - เก่า (ไม่ใช้แล้ว)
- `SUPABASE_RLS_POLICIES_WITH_ADMIN.sql` - เก่า (ไม่ใช้แล้ว)
- `TEST_RLS_POLICIES.sql` - ไม่ใช้แล้ว (ปิด RLS แทน)

### SQL Scripts - Migration/Setup เก่า
- `CREATE_PURCHASE_ORDERS_TABLE.sql` - เก่า (ใช้ V2 แทน)
- `CREATE_PURCHASE_ORDERS_TABLE_V2.sql` - เก็บไว้ (ถ้ายังใช้)
- `ADD_PO_ITEMS_COLUMNS.sql` - ใช้ครั้งเดียวแล้ว
- `ADD_ORDER_NOTES_COLUMN.sql` - Optional (ถ้าไม่ใช้ Notes)
- `ADD_CUSTOMER_PRINTCOUNT_COLUMN.sql` - ใช้ครั้งเดียวแล้ว
- `FIX_NOTIFICATIONS_TABLE.sql` - ใช้ครั้งเดียวแล้ว
- `CHECK_TABLE_STRUCTURE.sql` - ใช้ครั้งเดียวแล้ว
- `DELETE_DATA_EXAMPLES.sql` - ตัวอย่าง (ไม่จำเป็น)
- `CLEAR_ALL_DATA.sql` - เก่า (ใช้ KEEP_PRODUCTS แทน)
- `RESET_AND_CREATE_ADMIN.sql` - เก่า (ใช้ KEEP_PRODUCTS แทน)
- `CREATE_ADMIN_USER.sql` - รวมอยู่ใน RESET script

### Documentation - ซ้ำซ้อน/เก่า
- `CONSTRAINTS_SUMMARY.md` - ซ้ำกับ `CONSTRAINTS_COMPLETE_SUMMARY.md`
- `FIX_CREDIT_RLS_STEP_BY_STEP.md` - เก่า (ไม่ใช้แล้ว)
- `QUICK_FIX_RLS.md` - เก่า (ไม่ใช้แล้ว)
- `HOW_TO_FIX_RLS_ERRORS.md` - เก่า (ไม่ใช้แล้ว)
- `HOW_TO_RUN_RLS_POLICIES.md` - เก่า (ไม่ใช้แล้ว)
- `RLS_ALL_TABLES_FIX.md` - เก่า (ไม่ใช้แล้ว)
- `RLS_CUSTOM_AUTH_FIX.md` - เก่า (ไม่ใช้แล้ว)
- `RLS_FIX_GUIDE.md` - เก่า (ไม่ใช้แล้ว)
- `RLS_TESTING_GUIDE.md` - เก่า (ไม่ใช้แล้ว)
- `MIGRATION_*.md` - เก่า (migration เสร็จแล้ว)
  - `MIGRATION_COMPLETE.md`
  - `MIGRATION_GUIDE.md`
  - `MIGRATION_PLAN_DETAILED.md`
  - `MIGRATION_STATUS.md`
  - `MIGRATION_STRATEGY.md`
  - `MIGRATION_SUMMARY.md`
- `SUPABASE_CONNECTION_CHECK.md` - ใช้ครั้งเดียวแล้ว
- `SUPABASE_RENAME_COLUMN.md` - ใช้ครั้งเดียวแล้ว
- `SUPABASE_SETUP_GUIDE.md` - เก่า (setup เสร็จแล้ว)
- `HOW_TO_DELETE_DATA_IN_SUPABASE.md` - เก่า (ใช้ RESET_DATABASE_GUIDE.md แทน)
- `PAGES_INVENTORY.md` - เก่า (ไม่ใช้แล้ว)
- `OPTIMIZATION_PLAN.md` - เก่า (ไม่ใช้แล้ว)

## 📁 โครงสร้างไฟล์ที่ดำเนินการแล้ว

```
App RANGSAN/
├── sql/
│   ├── setup/
│   │   ├── SUPABASE_TABLES_SETUP.sql
│   │   ├── CREATE_USER_APPROVALS_TABLE.sql
│   │   └── ADD_USERS_PRIMARY_KEY.sql
│   ├── security/
│   │   ├── FIX_ALL_RLS_FOR_CUSTOM_AUTH.sql
│   │   ├── ADD_DATABASE_CONSTRAINTS.sql
│   │   └── CHECK_RLS_STATUS.sql
│   ├── maintenance/
│   │   ├── RESET_AND_CREATE_ADMIN_KEEP_PRODUCTS.sql
│   │   ├── CHANGE_REGISTEREDDATE_TO_TIMESTAMP.sql
│   │   └── CHECK_DUPLICATE_EMAILS.sql
│   └── verify/
│       └── VERIFY_ALL_CONSTRAINTS.sql
├── docs/
│   ├── PROJECT_STATUS_UPDATED.md
│   ├── RLS_DISABLED_SECURITY_ANALYSIS.md
│   ├── RLS_SECURITY_RECOMMENDATIONS.md
│   ├── RESET_DATABASE_GUIDE.md
│   └── SECURITY_IMPROVEMENTS_PLAN.md
├── [SQL ที่ยังอยู่ที่ root ตามการใช้งาน]
│   ├── ADD_ORDERSTEP_TO_PRODUCTS.sql
│   ├── ALTER_PRODUCTS_PRICE_TO_NUMERIC.sql
│   ├── SUPABASE_TRIGGERS.sql
│   ├── CREATE_SETTINGS_TABLE.sql
│   ├── CREATE_NOTIFICATIONS_TABLE.sql
│   ├── RECREATE_COUPONS_TABLE.sql
│   ├── CREATE_PROMOTIONS_TABLE.sql
│   ├── ADD_GETPRODUCTID_TO_PROMOTIONS.sql
│   ├── CREATE_PURCHASE_ORDERS_TABLE_V2.sql
│   ├── CREATE_FRANCHISE_STOCK_TABLES.sql
│   ├── CLEAR_ALL_DATA_KEEP_PRODUCTS.sql
│   ├── CREATE_STOCK_LOGS_TABLE.sql
│   └── CREATE_TAX_INVOICES_TABLE.sql
└── [ไฟล์โปรเจคอื่นๆ]
```

**หมายเหตุ:** ไฟล์ในรายการ "ควรลบ" ของแผนส่วนใหญ่ไม่มีอยู่ในโปรเจกต์ จึงไม่ได้ลบจากรายการนั้น นอกจากนี้ได้ลบไฟล์ที่ไม่เกี่ยวข้องกับโปรเจกต์ Vite/React + Supabase แล้ว ได้แก่
- `Code.js`, `DiscordNotify.js` – สคริปต์ Google Apps Script (backend เก่า โปรเจกต์ใช้ Supabase แล้ว)
- `appsscript.json`, `.clasp.json` – config ของ Google Apps Script
- `index_old.html`, `index_standalone.html` – HTML เก่า (แอปใช้ `index.html` + Vite)
- `README_VITE.md` – readme ต้นแบบของ Vite (มี ENV_SETUP, QUICK_START ฯลฯ อยู่แล้ว)
