# รูปแบบโค้ด (Code Style)

เอกสารสั้นสำหรับการจัดระเบียบโค้ดในโปรเจกต์

## ลำดับการ import

เรียงตามกลุ่มด้านล่าง (คั่นกลุ่มด้วยบรรทัดว่างถ้าต้องการ):

1. **React** – `import { useState, useEffect } from 'react'`
2. **Third-party** – react-router-dom, chart.js, sweetalert2 ฯลฯ
3. **Components** – ตาม path เช่น `../components/common/Header`
4. **Services** – `../services/orderService` ฯลฯ
5. **Utils / Constants** – `../utils/supabase`, `../utils/datePresets` ฯลฯ

ภายในกลุ่มเดียวกัน เรียงตาม path หรือชื่อไฟล์ (เช่น components เรียง A–Z) เพื่อให้หาง่าย

## โค้ดที่ใช้ร่วมกัน

- **ช่วงวันที่ + รูปแบบการค้นหา (ทั้งหมด, 7/30 วัน, 1 เดือน)**  
  ใช้ `DateRangeFilter` จาก `components/common/DateRangeFilter.jsx` และยูทิลิตี้จาก `utils/datePresets.js` (toYmd, getPresetRange, DATE_PRESETS) แทนการ copy-paste logic ในแต่ละหน้า

- **การ group ออเดอร์**  
  ตาราง `order` เก็บทีละแถวต่อรายการ ส่งกลับเป็น array ของออเดอร์ (รวม Items) ผ่าน `orderService.getUserOrders` / `getAllOrders`

## Comments

- ฟังก์ชันหรือบล็อกที่ซับซ้อน (เช่น logic รองรับหลายชื่อคอลัมน์, การรวมแถว) ใส่ comment สั้นอธิบายเหตุผลหรือขั้นตอน
- ไฟล์ service ใส่ block comment ด้านบนอธิบายบทบาทของโมดูล
