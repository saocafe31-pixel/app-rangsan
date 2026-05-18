# การใช้ Cache (Caching)

โปรเจกต์ใช้ **in-memory cache** (Map) ใน `src/utils/cache.js` เพื่อลดการดึงข้อมูลซ้ำจาก Supabase

## ค่าที่ใช้

- **CACHE_DURATION** (constants.js) – 5 นาที ใช้กับ products และ orders
- **CREDIT_CACHE_TTL** – 1 นาที ใช้กับยอดเครดิต

## API ใน cache.js

| ฟังก์ชัน | ความหมาย |
|----------|----------|
| `getCached(key)` | คืนค่าจาก cache ถ้ายังไม่หมดอายุ |
| `setCached(key, data, ttl?)` | เก็บค่า (ถ้าไม่ใส่ ttl ใช้ CACHE_DURATION) |
| `clearCache(key?)` | ลบ key เดียว หรือลบทั้งหมดถ้าไม่ส่ง key |
| `invalidateByPrefix(prefix)` | ลบทุก key ที่ขึ้นต้นด้วย prefix |

## สิ่งที่ถูกแคช

1. **Products** – ใน `useProducts` (key รูปแบบ `products_${user?.email}_${page}_${search}`)  
   - ล้างเมื่อสั่งออเดอร์สำเร็จ: `invalidateByPrefix('products_')`

2. **Orders** – ใน `useOrders` (key `orders_${user.email}`)  
   - ล้างเมื่อสั่งออเดอร์สำเร็จ: `invalidateByPrefix('orders_')`

3. **ยอดเครดิต** – ใน `creditService.getUserCredit` (key `credit_${userEmail}`)  
   - ล้างอัตโนมัติเมื่อ: อนุมัติเติมเงิน, หักเครดิต, คืนเครดิต, แอดมินเติมให้ (ผ่าน `creditService.invalidateCreditCache()`)

## การล้าง cache หลังสั่งออเดอร์

ใน `Checkout.jsx` หลัง place order จะเรียก:

- `invalidateByPrefix('products_')` – ให้หน้าโฮมโหลดสินค้า/สต็อกใหม่
- `invalidateByPrefix('orders_')` – ให้ประวัติออเดอร์โหลดใหม่

ไม่ล้าง cache เครดิตทั้งหมด เพื่อให้ Header/หน้าอื่นที่พึ่ง cache เครดิตยังใช้ค่าเดิมได้จนกว่าจะถึง TTL หรือมีการเติม/หัก (ซึ่งจะ invalidate อยู่แล้ว)

## การเพิ่มแคชจุดอื่น

- ใช้ key ขึ้นต้นด้วย prefix เดียวกัน (เช่น `reports_`, `notifications_`) แล้วล้างด้วย `invalidateByPrefix('reports_')` เมื่อข้อมูลเปลี่ยน
- ต้องการ TTL คนละค่า: ใช้ `setCached(key, data, ttlMs)`
