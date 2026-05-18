-- ============================================
-- Supabase Tables Setup for APP RANGSAN
-- ============================================

-- ============================================
-- 1. NOTIFICATIONS TABLE
-- ============================================
-- สำหรับเก็บการแจ้งเตือนลูกค้า (order changes, cancellations, etc.)

CREATE TABLE IF NOT EXISTS notifications (
    ID SERIAL PRIMARY KEY,
    UserEmail TEXT NOT NULL,
    Type TEXT NOT NULL, -- 'order_edited', 'order_cancelled', 'order_status_changed', etc.
    Title TEXT NOT NULL,
    Message TEXT NOT NULL,
    OrderID TEXT, -- NULL if not related to order
    Metadata JSONB, -- สำหรับเก็บข้อมูลเพิ่มเติม เช่น { oldTotal, newTotal, diff, status, tracking, note }
    Read BOOLEAN DEFAULT FALSE,
    CreatedAt TIMESTAMP DEFAULT NOW()
);

-- สร้าง index เพื่อเพิ่มประสิทธิภาพการค้นหา
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(UserEmail);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(Read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_order_id ON notifications(OrderID) WHERE OrderID IS NOT NULL;

-- ============================================
-- 2. CREDIT TRANSACTIONS TABLE
-- ============================================
-- สำหรับเก็บประวัติการเติมเงินเครดิต

CREATE TABLE IF NOT EXISTS credit_transactions (
    ID SERIAL PRIMARY KEY,
    TransactionID TEXT UNIQUE NOT NULL, -- เช่น "CREDIT-20250119-001"
    UserEmail TEXT NOT NULL,
    Amount DECIMAL(10, 2) NOT NULL, -- จำนวนเงินที่เติม
    PaymentMethod TEXT, -- 'transfer', 'cash', etc.
    SlipURL TEXT, -- URL ของสลิปโอนเงิน (ถ้ามี)
    Status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    Note TEXT, -- หมายเหตุ
    AdminEmail TEXT, -- Email ของ admin ที่อนุมัติ/ปฏิเสธ
    ApprovedAt TIMESTAMP, -- เวลาที่อนุมัติ
    CreatedAt TIMESTAMP DEFAULT NOW()
);

-- สร้าง index
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_email ON credit_transactions(UserEmail);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_status ON credit_transactions(Status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_transaction_id ON credit_transactions(TransactionID);

-- ============================================
-- 3. CREDIT APPROVALS TABLE (Optional - ถ้าต้องการแยกตาราง)
-- ============================================
-- หรือสามารถใช้ credit_transactions โดยตรงก็ได้
-- ตารางนี้ใช้สำหรับเก็บประวัติการอนุมัติ/ปฏิเสธ

CREATE TABLE IF NOT EXISTS credit_approvals (
    ID SERIAL PRIMARY KEY,
    TransactionID TEXT NOT NULL, -- Reference to credit_transactions.TransactionID
    UserEmail TEXT NOT NULL,
    Amount DECIMAL(10, 2) NOT NULL,
    Action TEXT NOT NULL, -- 'approve' or 'reject'
    AdminEmail TEXT NOT NULL, -- Email ของ admin ที่อนุมัติ/ปฏิเสธ
    Note TEXT, -- หมายเหตุจาก admin
    CreatedAt TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (TransactionID) REFERENCES credit_transactions(TransactionID) ON DELETE CASCADE
);

-- สร้าง index
CREATE INDEX IF NOT EXISTS idx_credit_approvals_transaction_id ON credit_approvals(TransactionID);
CREATE INDEX IF NOT EXISTS idx_credit_approvals_user_email ON credit_approvals(UserEmail);
CREATE INDEX IF NOT EXISTS idx_credit_approvals_created_at ON credit_approvals(CreatedAt DESC);

-- ============================================
-- 4. USER CREDITS TABLE (Optional - สำหรับเก็บยอดเครดิตปัจจุบัน)
-- ============================================
-- หรือสามารถคำนวณจาก credit_transactions ที่ status = 'approved' ก็ได้

CREATE TABLE IF NOT EXISTS user_credits (
    UserEmail TEXT PRIMARY KEY,
    Balance DECIMAL(10, 2) DEFAULT 0, -- ยอดเครดิตปัจจุบัน
    TotalAdded DECIMAL(10, 2) DEFAULT 0, -- ยอดรวมที่เติมทั้งหมด
    TotalUsed DECIMAL(10, 2) DEFAULT 0, -- ยอดรวมที่ใช้ทั้งหมด
    UpdatedAt TIMESTAMP DEFAULT NOW()
);

-- สร้าง index
CREATE INDEX IF NOT EXISTS idx_user_credits_updated_at ON user_credits(UpdatedAt DESC);

-- ============================================
-- 5. CREDIT USAGE LOG TABLE (Optional - สำหรับเก็บประวัติการใช้เครดิต)
-- ============================================

CREATE TABLE IF NOT EXISTS credit_usage_log (
    ID SERIAL PRIMARY KEY,
    UserEmail TEXT NOT NULL,
    OrderID TEXT NOT NULL, -- Reference to order.OrderID
    Amount DECIMAL(10, 2) NOT NULL, -- จำนวนเครดิตที่ใช้
    CreatedAt TIMESTAMP DEFAULT NOW()
);

-- สร้าง index
CREATE INDEX IF NOT EXISTS idx_credit_usage_log_user_email ON credit_usage_log(UserEmail);
CREATE INDEX IF NOT EXISTS idx_credit_usage_log_order_id ON credit_usage_log(OrderID);
CREATE INDEX IF NOT EXISTS idx_credit_usage_log_created_at ON credit_usage_log(CreatedAt DESC);

-- ============================================
-- NOTES:
-- ============================================
-- 1. หลังจากสร้างตารางแล้ว ควรปิด RLS (Row Level Security) หรือสร้าง policies
-- 2. สำหรับ notifications: ควรให้ user อ่านได้เฉพาะของตัวเอง
-- 3. สำหรับ credit_transactions: ควรให้ user อ่านได้เฉพาะของตัวเอง, admin อ่านได้ทั้งหมด
-- 4. สำหรับ user_credits: ควรให้ user อ่านได้เฉพาะของตัวเอง, admin อ่านได้ทั้งหมด
-- 5. ควรเพิ่ม trigger เพื่ออัปเดต user_credits.Balance เมื่อ credit_transactions ถูกอนุมัติ
