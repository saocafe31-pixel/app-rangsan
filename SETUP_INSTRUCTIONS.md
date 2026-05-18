# 🚀 คำแนะนำการ Setup โปรเจกต์ Vite

## ✅ สิ่งที่ทำเสร็จแล้ว

1. ✅ สร้างโครงสร้างโปรเจกต์ Vite + React
2. ✅ Setup package.json, vite.config.js, tailwind.config.js
3. ✅ สร้าง utils (supabase, constants, helpers, cache)
4. ✅ สร้าง App.jsx พร้อม routing และ code splitting
5. ✅ สร้างหน้า Login พื้นฐาน

---

## 📋 ขั้นตอนการ Setup

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. สร้างไฟล์ Environment Variables

1. คัดลอก `.env.example` เป็น `.env.local`
2. ไปที่ Supabase Dashboard → Project Settings → API
3. ใส่ใน `.env.local`:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_KEY` = anon/public key

**ห้าม commit ไฟล์ `.env.local` หรือไฟล์ที่มี key จริงลง Git**

### 3. รัน Development Server

```bash
npm run dev
```

แอปจะเปิดที่ `http://localhost:3000`

---

## ⚠️ สิ่งที่ยังต้องทำ

### Phase 1: สร้าง Pages (สำคัญ!)

ตอนนี้มีแค่หน้า **Login** เท่านั้น ต้องสร้าง pages อื่นๆ:

1. **Home.jsx** - หน้าหลัก (product list, cart)
2. **History.jsx** - ประวัติการสั่งซื้อ
3. **Profile.jsx** - ข้อมูลส่วนตัว
4. **TaxInvoice.jsx** - ใบกำกับภาษี
5. **AdminDashboard.jsx** - Dashboard สำหรับ admin
6. **AdminOrders.jsx** - จัดการออเดอร์
7. **AdminProducts.jsx** - จัดการสินค้า
8. **StockManagement.jsx** - จัดการสต็อก

### Phase 2: สร้าง Components

- ProductCard, ProductList, ProductForm
- OrderCard, OrderList, Cart
- Header, Sidebar
- และอื่นๆ

### Phase 3: สร้าง Hooks

- useProducts
- useOrders
- useAuth
- useCart

### Phase 4: สร้าง Services

- productService.js
- orderService.js
- imageService.js
- printService.js

---

## 🔄 วิธีย้ายโค้ดจาก index.html เดิม

**⚠️ หมายเหตุ:** ไฟล์ `index.html` เดิมถูกเขียนทับแล้ว

**ถ้าต้องการโค้ดเดิม:**
- ตรวจสอบ Git history (ถ้ามี)
- หรือใช้โค้ดจาก backup

**วิธีย้ายโค้ด:**

1. เปิดไฟล์ `index.html` เดิม (ถ้ายังมี backup)
2. คัดลอกโค้ดของแต่ละหน้า
3. สร้างไฟล์ page ใหม่ใน `src/pages/`
4. แปลงโค้ดให้เป็น React component
5. แก้ไข imports และ paths
6. ทดสอบ

**ตัวอย่าง:** ดูใน `MIGRATION_GUIDE.md`

---

## 📝 Checklist

### ก่อนเริ่ม
- [ ] รัน `npm install`
- [ ] สร้าง `.env.local`
- [ ] รัน `npm run dev` เพื่อทดสอบ
- [ ] ตรวจสอบว่า Login page ทำงาน

### ระหว่างพัฒนา
- [ ] สร้าง pages ทีละหน้า
- [ ] สร้าง components ที่จำเป็น
- [ ] ทดสอบแต่ละหน้าหลังสร้าง
- [ ] แก้ไข imports และ paths

### หลังเสร็จ
- [ ] ทดสอบทุกหน้า
- [ ] Build production: `npm run build`
- [ ] Deploy

---

## 🐛 Troubleshooting

### ปัญหา: `Cannot find module`
```bash
# ลบ node_modules และติดตั้งใหม่
rm -rf node_modules
npm install
```

### ปัญหา: Environment variables ไม่ทำงาน
- ตรวจสอบว่าไฟล์ `.env.local` อยู่ใน root directory
- ตรวจสอบว่าใช้ prefix `VITE_` ถูกต้อง
- Restart dev server

### ปัญหา: Port 3000 ถูกใช้แล้ว
แก้ไขใน `vite.config.js`:
```js
server: {
  port: 3001, // เปลี่ยนเป็น port อื่น
}
```

---

## 📚 Resources

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [React Router](https://reactrouter.com/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 💡 Tips

1. **ย้ายทีละส่วน** - อย่าพยายามย้ายทุกอย่างพร้อมกัน
2. **ทดสอบบ่อยๆ** - ทดสอบหลังย้ายแต่ละหน้า
3. **ใช้ Git** - commit ทุกครั้งที่ย้ายเสร็จ 1 หน้า
4. **อ่าน Error Messages** - มักจะบอกปัญหาได้ชัดเจน

---

**ต้องการความช่วยเหลือเพิ่มเติม?** แจ้งได้เลย! 🚀
