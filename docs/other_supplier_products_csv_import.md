# นำเข้าข้อมูลสินค้าซัพนอกจาก CSV

ใช้ได้ในหน้า **จัดการสต็อกแฟรนไชส์** → แท็บ **สั่งสินค้าซัพอื่น** → ปุ่ม **นำเข้าจาก CSV**

## รูปแบบไฟล์ CSV

- บันทึกจาก Google Sheet / Excel เป็น **CSV (Comma Separated Values)**
- แถวแรกต้องเป็น **หัวคอลัมน์** (header)
- ตั้งแต่แถวที่สองเป็นข้อมูลสินค้า

### คอลัมน์ที่รองรับ (หัวคอลัมน์เป็นภาษาไทยหรืออังกฤษก็ได้)

| คอลัมน์ (EN) | คอลัมน์ (TH) | บังคับ | ค่าเริ่มต้น | หมายเหตุ |
|-------------|-------------|--------|------------|----------|
| productid   | รหัส        | ใช่    | -          | ไม่ซ้ำกัน (unique) |
| productname | ชื่อสินค้า  | ใช่    | -          | |
| stock       | สต็อก       | ไม่    | 0          | |
| minstock    | ขั้นต่ำ     | ไม่    | 5          | |
| price       | ราคา        | ไม่    | 0          | |
| supplier    | ซัพพลาย     | ไม่    | null       | เช่น MAKRO, ซัพอื่นๆ |
| image       | รูป         | ไม่    | null       | URL รูปภาพ |
| unit        | หน่วย       | ไม่    | ชิ้น       | |

### ตัวอย่างหัวคอลัมน์ (แถวแรก)

รองรับหลายรูปแบบ เช่น **ID/Name** (จาก Sheet), **productid/productname**, หรือ **รหัส/ชื่อสินค้า**

**แบบ ID, Name (เช่น export จาก Sheet):**
```csv
ID,Name,Stock,Min,Price,Supplier,Image,unit
```

**แบบอังกฤษยาว:**
```csv
productid,productname,stock,minstock,price,supplier,image,unit
```

**แบบไทย:**
```csv
รหัส,ชื่อสินค้า,สต็อก,ขั้นต่ำ,ราคา,ซัพพลาย,รูป,หน่วย
```

### ตัวอย่างข้อมูล (แถวที่ 2 ลงไป)

```csv
productid,productname,stock,minstock,price,supplier,image,unit
M184293,เอโร่ น้ำพริกเผาทาขนมปัง 1 กก,0,1,76,MAKRO,,ชิ้น
S021,ตะเกียบ,0,1,30,ซัพอื่นๆ,,ชิ้น
```

## พฤติกรรมการนำเข้า

- **Upsert ตามรหัสสินค้า (productid)**  
  - ถ้ารหัสมีในตารางแล้ว → **อัปเดต** แถวนั้น  
  - ถ้ารหัสยังไม่มี → **เพิ่ม** แถวใหม่  
- ค่าใน CSV จะเขียนทับค่าที่มีใน DB (ยกเว้นฟิลด์ที่เว้นว่างใน CSV อาจไม่ทับ ขึ้นกับ logic ในแอป)

## ตารางปลายทาง (Supabase)

```sql
create table public.other_supplier_products (
  id uuid not null default gen_random_uuid(),
  productid text not null,
  productname text not null,
  stock numeric not null default 0,
  minstock numeric not null default 5,
  price numeric not null default 0,
  created_at timestamptz null default now(),
  supplier text null,
  image text null,
  unit text null,
  constraint other_supplier_products_pkey primary key (id),
  constraint other_supplier_products_productid_key unique (productid)
);
```
