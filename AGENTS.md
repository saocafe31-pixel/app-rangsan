# คำแนะสำหรับ Agent และผู้ร่วมพัฒนา

ไฟล์นี้เป็น **จุดเข้า** สำหรับ AI Agent และผู้ที่มาแก้โปรเจกต์ครั้งแรก — อ่านคู่กับกฎใน `.cursor/rules/`

---

## อ่านก่อนลงมือ

| ลำดับ | เอกสาร | เหตุผล |
|--------|--------|--------|
| 1 | **[docs/PROJECT_WORKFLOW_REPORT.md](./docs/PROJECT_WORKFLOW_REPORT.md)** | ประเภทงาน (scope), ลำดับ workflow, progress log, การตรวจลิงก์เอกสาร |
| 2 | **[docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md)** | ติดตั้ง, โครงสร้าง, เลเยอร์โค้ด, ลิงก์เอกสารอื่น |
| 3 | **[.cursor/rules/project-workflow.mdc](./.cursor/rules/project-workflow.mdc)** | กฎบังคับที่ Cursor โหลดให้ Agent |
| 4 | **[docs/PROGRESS_LOG.md](./docs/PROGRESS_LOG.md)** | บันทึกรอบงาน — บังคับเมื่อมีการเปลี่ยนแปลงไฟล์ใน repo |

---

## สิ่งที่ต้องทำตามโปรเจกต์นี้

- **ระบุ scope** (`feat` / `fix` / `docs` / `chore`) และผลกระทบเมื่องานกว้างหรือคลุมเครือ
- **progress log:** เมื่อจบรอบงานและ **มีการเปลี่ยนแปลงไฟล์** ใน repo ต้องเพิ่มรายการใน [docs/PROGRESS_LOG.md](./docs/PROGRESS_LOG.md) ใต้ `<!-- progress-log-entries -->` ตามรูปแบบในไฟล์นั้น (งานอ่านอย่างเดียวโดยไม่แก้ไฟล์ — ไม่บังคับ)
- **ลบไฟล์ที่ไม่เกี่ยวข้อง:** ก่อนปิดงาน ลบไฟล์ชั่วคราว/ทดลองที่ไม่ commit และไม่ควรอยู่ใน repo
- **docs/chore:** ไม่เปลี่ยนพฤติกรรมผู้ใช้โดยไม่ตั้งใจ — จำกัด diff ให้ตรงงาน
- **แก้ markdown:** ตรวจลิงก์ relative ภายใน repo ว่าชี้ไฟล์ที่มีจริง; อัปเดต [README.md](./README.md) และ [docs/README.md](./docs/README.md) เมื่อเพิ่มเอกสารหลัก
- **ความลับ:** ไม่ commit `.env.local`; ใช้ [.env.example](./.env.example) เป็นแม่แบบ
- **โค้ด:** สอดคล้องโครงสร้างที่มี (`src/services/`, `src/pages/` ฯลฯ) — ดู DEVELOPER_GUIDE

---

## ดัชนีเอกสาร

- **รากโปรเจกต์:** [README.md](./README.md)
- **ดัชนี `docs/`:** [docs/README.md](./docs/README.md)
