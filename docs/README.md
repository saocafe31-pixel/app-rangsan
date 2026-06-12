# เอกสารโปรเจกต์ (Documentation Index)

ชุดเอกสารหลักของโปรเจกต์ APP RANGSAN

---

## Workflow และ Agent

| เอกสาร | ความหมาย |
|--------|----------|
| **[PROJECT_WORKFLOW_REPORT.md](./PROJECT_WORKFLOW_REPORT.md)** | คู่มือ workflow, scope (feat/fix/docs/chore), progress log, การตรวจลิงก์เอกสาร, แม่แบบผลกระทบ/rollback |
| **[PROGRESS_LOG.md](./PROGRESS_LOG.md)** | บันทึกรอบงาน — บังคับเมื่อมีการเปลี่ยนแปลงไฟล์ใน repo |
| **[PROJECT_PROGRESS_LOG.md](./PROJECT_PROGRESS_LOG.md)** | บันทึกรายงานความคืบหน้าตามคำขอเฉพาะงาน พร้อม summary, impact, verification, rollback, next step |
| **[AGENTS.md](../AGENTS.md)** | จุดเข้าสำหรับ Agent — ลิงก์ไป workflow, DEVELOPER_GUIDE, กฎ `.cursor/rules` |
| **[.cursor/rules/project-workflow.mdc](../.cursor/rules/project-workflow.mdc)** | กฎบังคับการทำงานของ Agent ใน Cursor |

---

## ชุด API / User / Developer (หัวข้อ 7)

| เอกสาร | ความหมาย |
|--------|----------|
| **[API_REFERENCE.md](./API_REFERENCE.md)** | ตาราง Supabase, Services, รูปแบบการเรียกข้อมูล (Data layer) |
| **[USER_GUIDE.md](./USER_GUIDE.md)** | คู่มือผู้ใช้: ลูกค้า, แฟรนไชส์, แอดมิน + FAQ |
| **[USER_MANUAL.md](./USER_MANUAL.md)** | คู่มือการใช้งานแอป (ภาษาไทย) — ภาพรวม, ล็อกอิน, เมนูแต่ละฝั่ง, แก้ปัญหาเบื้องต้น |
| **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** | คู่มือนักพัฒนา: ติดตั้ง, โครงสร้าง, รัน, deploy, ลิงก์เอกสารอื่น |

---

## เอกสารอื่นในโฟลเดอร์ docs

| เอกสาร | ความหมาย |
|--------|----------|
| **SETTINGS_GUIDE.md** | แนวทางตั้งค่าทั่วไป — key ในตาราง `settings` (shop, vat, maintenance, features ฯลฯ) |
| **RLS_SECURITY_RECOMMENDATIONS.md** | แนวทาง RLS และความปลอดภัย |
| **RLS_DISABLED_SECURITY_ANALYSIS.md** | การวิเคราะห์เมื่อปิด RLS |
| **RESET_DATABASE_GUIDE.md** | คู่มือ reset ฐานข้อมูล |
| **SECURITY_IMPROVEMENTS_PLAN.md** | แผนปรับปรุงความปลอดภัย |
| **PROJECT_STATUS_UPDATED.md** | สถานะโปรเจกต์ (อัปเดตตามช่วง) |

---

## การโคลนและติดตั้งใหม่

| เอกสาร | ความหมาย |
|--------|----------|
| **[COPY_PROJECT_QUICK_GUIDE.md](./COPY_PROJECT_QUICK_GUIDE.md)** | คัดลอกโฟลเดอร์สร้าง instance ใหม่ — เช็กลิสต์สั้น, สิ่งที่ห้าม copy |
| **[CLONE_APP.md](./CLONE_APP.md)** | โคลน Git / คัดลอกโฟลเดอร์, แยก Supabase & Vercel, ลำดับ SQL, `.env.local` |
| **[PROJECT_VERIFICATION.md](./PROJECT_VERIFICATION.md)** | เช็ก build, test, env, เอกสาร — ก่อนส่งมอบหรือ deploy |

---

## เอกสารระดับโปรเจกต์ (รากโปรเจกต์)

| เอกสาร | ความหมาย |
|--------|----------|
| **README.md** (รากโปรเจกต์) | คำสั่งเริ่มต้น + ลิงก์ workflow/Agent และเอกสารอื่น |
| **AGENTS.md** | onboarding Agent / ผู้ร่วมพัฒนา |
| **DEPLOY.md** | ขั้นตอน Deploy: DB, Frontend, Monitoring |
| **DEVELOPMENT_ROADMAP.md** | แผนพัฒนาต่อ และสถานะฟีเจอร์ |
| **ENV_SETUP.md** | ตั้งค่า environment แบบละเอียด |
| **TROUBLESHOOTING.md** | แก้ปัญหาเบื้องต้น |
| **TESTING.md** | การรันเทสต์ (Vitest, coverage) |
