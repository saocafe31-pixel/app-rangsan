-- แบ่งหน้ารายการออเดอร์ (แอดมิน): นับตาม OrderID จริง ไม่ใช่ตามแถวรายการสินค้า
-- ต้องรัน migration นี้เพื่อให้หน้า AdminOrders โหลดเร็ว (หน้าละ N ออเดอร์)

CREATE OR REPLACE FUNCTION public.get_admin_orders_page_ids(
  p_limit integer,
  p_offset integer,
  p_status text DEFAULT NULL,
  p_order_id_search text DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ids text[];
  v_total bigint;
BEGIN
  WITH line AS (
    SELECT
      NULLIF(
        trim(both from COALESCE(o."OrderID"::text, o.orderid::text, o.order_id::text)),
        ''
      ) AS oid,
      COALESCE(o."Timestamp", o."CreatedAt", o.timestamp, o.created_at)::timestamptz AS ts,
      COALESCE(o."Status", o.status) AS st
    FROM public."order" o
  ),
  filtered AS (
    SELECT l.oid, l.ts, l.st
    FROM line l
    WHERE l.oid IS NOT NULL
      AND (
        p_order_id_search IS NULL
        OR trim(both from p_order_id_search) = ''
        OR lower(l.oid) LIKE '%' || lower(trim(both from p_order_id_search)) || '%'
      )
      AND (
        p_status IS NULL
        OR trim(both from p_status) = ''
        OR lower(trim(both from p_status)) = 'all'
        OR l.st = p_status
      )
      AND (p_date_start IS NULL OR (l.ts AT TIME ZONE 'Asia/Bangkok')::date >= p_date_start)
      AND (p_date_end IS NULL OR (l.ts AT TIME ZONE 'Asia/Bangkok')::date <= p_date_end)
  ),
  grouped AS (
    SELECT oid, max(ts) AS mx
    FROM filtered
    GROUP BY oid
  ),
  tot AS (
    SELECT COUNT(*)::bigint AS c FROM grouped
  ),
  paged AS (
    SELECT g.oid, g.mx
    FROM grouped g
    ORDER BY g.mx DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    COALESCE(
      (SELECT array_agg(p.oid ORDER BY p.mx DESC) FROM paged p),
      ARRAY[]::text[]
    ),
    COALESCE((SELECT c FROM tot), 0::bigint)
  INTO v_ids, v_total;

  RETURN json_build_object('order_ids', v_ids, 'total', v_total);
END;
$$;

COMMENT ON FUNCTION public.get_admin_orders_page_ids(integer, integer, text, text, date, date) IS
  'คืน order_ids ของหนึ่งหน้า (เรียงใหม่สุดก่อน) และจำนวนออเดอร์ทั้งหมดที่ตรงตัวกรอง';

CREATE OR REPLACE FUNCTION public.get_admin_order_status_counts(
  p_order_id_search text DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_all bigint;
  v_pending bigint;
  v_prep bigint;
  v_shipped bigint;
  v_cancel bigint;
BEGIN
  WITH line AS (
    SELECT
      NULLIF(
        trim(both from COALESCE(o."OrderID"::text, o.orderid::text, o.order_id::text)),
        ''
      ) AS oid,
      COALESCE(o."Timestamp", o."CreatedAt", o.timestamp, o.created_at)::timestamptz AS ts,
      COALESCE(o."Status", o.status) AS st
    FROM public."order" o
  ),
  filtered AS (
    SELECT l.oid, l.ts, l.st
    FROM line l
    WHERE l.oid IS NOT NULL
      AND (
        p_order_id_search IS NULL
        OR trim(both from p_order_id_search) = ''
        OR lower(l.oid) LIKE '%' || lower(trim(both from p_order_id_search)) || '%'
      )
      AND (p_date_start IS NULL OR (l.ts AT TIME ZONE 'Asia/Bangkok')::date >= p_date_start)
      AND (p_date_end IS NULL OR (l.ts AT TIME ZONE 'Asia/Bangkok')::date <= p_date_end)
  ),
  grouped AS (
    SELECT
      oid,
      (array_agg(st ORDER BY ts DESC NULLS LAST))[1] AS rep_st
    FROM filtered
    GROUP BY oid
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE rep_st = 'รอตรวจสอบ')::bigint,
    COUNT(*) FILTER (WHERE rep_st = 'กำลังจัดเตรียม')::bigint,
    COUNT(*) FILTER (WHERE rep_st = 'จัดส่งแล้ว')::bigint,
    COUNT(*) FILTER (WHERE rep_st = 'ยกเลิก')::bigint
  INTO v_all, v_pending, v_prep, v_shipped, v_cancel
  FROM grouped;

  RETURN json_build_object(
    'All', COALESCE(v_all, 0),
    'รอตรวจสอบ', COALESCE(v_pending, 0),
    'กำลังจัดเตรียม', COALESCE(v_prep, 0),
    'จัดส่งแล้ว', COALESCE(v_shipped, 0),
    'ยกเลิก', COALESCE(v_cancel, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_order_status_counts(text, date, date) IS
  'นับจำนวนออเดอร์ (ตาม OrderID) ต่อสถานะ — ใช้ตัวกรองค้นหา/วันที่เดียวกับหน้าแบ่งหน้า';

GRANT EXECUTE ON FUNCTION public.get_admin_orders_page_ids(integer, integer, text, text, date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_order_status_counts(text, date, date) TO anon, authenticated;
