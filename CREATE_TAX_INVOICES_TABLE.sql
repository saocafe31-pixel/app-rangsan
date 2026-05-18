-- สร้างตาราง tax_invoices สำหรับเก็บข้อมูลใบกำกับภาษี
CREATE TABLE IF NOT EXISTS tax_invoices (
  id BIGSERIAL PRIMARY KEY,
  orderid TEXT NOT NULL,
  useremail TEXT NOT NULL,
  invoicedate TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  taxname TEXT NOT NULL,
  taxid TEXT NOT NULL,
  taxaddress TEXT,
  items JSONB,
  subtotal NUMERIC(10, 2) DEFAULT 0,
  discount NUMERIC(10, 2) DEFAULT 0,
  shipping NUMERIC(10, 2) DEFAULT 0,
  total NUMERIC(10, 2) DEFAULT 0,
  vat NUMERIC(10, 2) DEFAULT 0,
  prevat NUMERIC(10, 2) DEFAULT 0,
  printcount INTEGER DEFAULT 0,
  customer_printcount INTEGER NOT NULL DEFAULT 0,
  firstprintdate TIMESTAMP WITH TIME ZONE,
  lastprintdate TIMESTAMP WITH TIME ZONE,
  printedby TEXT,
  isadmin BOOLEAN DEFAULT false,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- สร้าง index สำหรับค้นหาข้อมูล
CREATE INDEX IF NOT EXISTS idx_tax_invoices_orderid ON tax_invoices(orderid);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_useremail ON tax_invoices(useremail);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_createdat ON tax_invoices(createdat DESC);

-- ปิด RLS (Row Level Security) เพราะใช้ custom authentication
ALTER TABLE tax_invoices DISABLE ROW LEVEL SECURITY;

-- เพิ่ม comment สำหรับตาราง
COMMENT ON TABLE tax_invoices IS 'ตารางเก็บข้อมูลใบกำกับภาษี';
COMMENT ON COLUMN tax_invoices.orderid IS 'เลขที่ออเดอร์';
COMMENT ON COLUMN tax_invoices.useremail IS 'อีเมลลูกค้า';
COMMENT ON COLUMN tax_invoices.invoicedate IS 'วันที่ออกใบกำกับภาษี';
COMMENT ON COLUMN tax_invoices.taxname IS 'ชื่อบริษัท/ผู้เสียภาษี';
COMMENT ON COLUMN tax_invoices.taxid IS 'เลขประจำตัวผู้เสียภาษี';
COMMENT ON COLUMN tax_invoices.taxaddress IS 'ที่อยู่ผู้เสียภาษี';
COMMENT ON COLUMN tax_invoices.items IS 'รายการสินค้า (JSON)';
COMMENT ON COLUMN tax_invoices.subtotal IS 'ยอดรวมก่อนส่วนลด';
COMMENT ON COLUMN tax_invoices.discount IS 'ส่วนลด';
COMMENT ON COLUMN tax_invoices.shipping IS 'ค่าจัดส่ง';
COMMENT ON COLUMN tax_invoices.total IS 'ยอดรวมทั้งสิ้น';
COMMENT ON COLUMN tax_invoices.vat IS 'ภาษีมูลค่าเพิ่ม 7%';
COMMENT ON COLUMN tax_invoices.prevat IS 'มูลค่าก่อนภาษี';
COMMENT ON COLUMN tax_invoices.printcount IS 'จำนวนครั้งที่พิมพ์ (ฝั่งแอดมิน/รวมระบบ)';
COMMENT ON COLUMN tax_invoices.customer_printcount IS 'จำนวนครั้งที่ลูกค้าพิมพ์ใบกำกับเอง';
COMMENT ON COLUMN tax_invoices.firstprintdate IS 'วันที่พิมพ์ครั้งแรก';
COMMENT ON COLUMN tax_invoices.lastprintdate IS 'วันที่พิมพ์ล่าสุด';
COMMENT ON COLUMN tax_invoices.printedby IS 'ผู้ที่พิมพ์';
COMMENT ON COLUMN tax_invoices.isadmin IS 'บันทึกโดยแอดมินหรือไม่';
