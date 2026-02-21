-- =============================================================================
-- VIEWS SCHEMA
-- =============================================================================


-- ---------------------------------------------------------------------------
-- cart_refund_status
--   Derives refund status per cart from the ledger.
--   Returns: sale_total, refunded_amount, net_amount, refund_status
--   refund_status: 'not_refunded' | 'partially_refunded' | 'fully_refunded'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.cart_refund_status AS
WITH sale_totals AS (
  SELECT cart_id,
         SUM(quantity * unit_price) AS sale_total,
         SUM(quantity)              AS sold_units
    FROM public.sold_products
   GROUP BY cart_id
),
refund_totals AS (
  SELECT r.cart_id,
         SUM(ri.quantity * ri.unit_price) AS refunded_amount,
         SUM(ri.quantity)                 AS refunded_units
    FROM public.refunds      r
    JOIN public.refund_items ri ON ri.refund_id = r.id
   GROUP BY r.cart_id
)
SELECT c.id                                                           AS cart_id,
       COALESCE(st.sale_total, 0)                                     AS sale_total,
       COALESCE(rt.refunded_amount, 0)                                AS refunded_amount,
       COALESCE(st.sale_total, 0) - COALESCE(rt.refunded_amount, 0)  AS net_amount,
       CASE
         WHEN rt.refunded_units IS NULL             THEN 'not_refunded'
         WHEN rt.refunded_units >= st.sold_units    THEN 'fully_refunded'
         ELSE                                            'partially_refunded'
       END                                                            AS refund_status
  FROM public.carts       c
  LEFT JOIN sale_totals   st ON st.cart_id = c.id
  LEFT JOIN refund_totals rt ON rt.cart_id = c.id;


-- ---------------------------------------------------------------------------
-- cart_summary
--   Carts joined with customer name, admin name, and refund status.
--   Use for order list / admin panel views — avoids joining 5 tables each time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.cart_summary AS
SELECT c.id,
       c.status,
       c.total,
       c.notes,
       c.created_at,
       c.updated_at,
       cu.full_name  AS customer_name,
       cu.email      AS customer_email,
       a.full_name   AS processed_by_name,
       crs.refunded_amount,
       crs.net_amount,
       crs.refund_status
  FROM public.carts              c
  LEFT JOIN public.customers     cu  ON cu.id  = c.customer_id
  LEFT JOIN public.admins        a   ON a.id   = c.processed_by
  LEFT JOIN public.cart_refund_status crs ON crs.cart_id = c.id;


-- ---------------------------------------------------------------------------
-- cart_line_items
--   sold_products joined with product name and total refunded quantity
--   aggregated across all refund events for that line item.
--   Use for order detail pages, receipts, and any "bought X, returned Y" UI.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.cart_line_items AS
SELECT sp.id              AS sold_product_id,
       sp.cart_id,
       sp.quantity        AS sold_quantity,
       sp.unit_price,
       sp.quantity * sp.unit_price              AS line_total,
       COALESCE(ri_agg.refunded_quantity, 0)    AS refunded_quantity,
       (sp.quantity - COALESCE(ri_agg.refunded_quantity, 0)) * sp.unit_price AS net_line_total,
       p.id               AS product_id,
       p.name             AS product_name,
       p.attributes       AS product_attributes
  FROM public.sold_products sp
  LEFT JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN (
    SELECT ri.sold_product_id,
           SUM(ri.quantity) AS refunded_quantity
      FROM public.refund_items ri
     GROUP BY ri.sold_product_id
  ) ri_agg ON ri_agg.sold_product_id = sp.id;


-- ---------------------------------------------------------------------------
-- refund_detail
--   refunds joined with refund_items, product name, and processing admin.
--   Use for refund history panels and reporting on what was returned and when.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.refund_detail AS
SELECT r.id              AS refund_id,
       r.cart_id,
       r.refund_amount,
       r.created_at      AS refunded_at,
       a.full_name       AS processed_by_name,
       ri.id             AS refund_item_id,
       ri.sold_product_id,
       ri.quantity       AS refunded_quantity,
       ri.unit_price,
       ri.quantity * ri.unit_price AS refund_line_total,
       p.id              AS product_id,
       p.name            AS product_name
  FROM public.refunds      r
  LEFT JOIN public.admins        a  ON a.id  = r.processed_by
  JOIN      public.refund_items  ri ON ri.refund_id = r.id
  LEFT JOIN public.sold_products sp ON sp.id = ri.sold_product_id
  LEFT JOIN public.products      p  ON p.id  = sp.product_id;