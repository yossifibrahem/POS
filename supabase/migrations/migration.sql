-- =============================================================================
-- MIGRATION: Add processed_by to cart_summary view
--
-- Change: Exposes c.processed_by (UUID) directly in the cart_summary view,
--         alongside the already-present processed_by_name and processed_by_level.
--         This allows the UI to reference the admin's UUID without a separate
--         query (e.g. for ownership checks on low-admin flows).
--
-- NOTE: CREATE OR REPLACE cannot insert a column mid-list, so we DROP first.
-- =============================================================================

DROP VIEW IF EXISTS public.cart_summary;

CREATE VIEW public.cart_summary AS
SELECT c.id,
       c.status,
       c.total,
       c.notes,
       c.created_at,
       c.updated_at,
       c.processed_by,
       cp.full_name  AS customer_name,
       cp.email      AS customer_email,
       ap.full_name  AS processed_by_name,
       a.level       AS processed_by_level,
       crs.refunded_amount,
       crs.net_amount,
       crs.refund_status
  FROM public.carts              c
  LEFT JOIN public.customers     cu  ON cu.id  = c.customer_id
  LEFT JOIN public.profiles      cp  ON cp.id  = cu.id
  LEFT JOIN public.admins        a   ON a.id   = c.processed_by
  LEFT JOIN public.profiles      ap  ON ap.id  = a.id
  LEFT JOIN public.cart_refund_status crs ON crs.cart_id = c.id;