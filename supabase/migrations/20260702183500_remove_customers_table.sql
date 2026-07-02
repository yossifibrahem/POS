-- Collapse customers into profiles: every profile is a customer.
-- Existing carts keep the same customer UUIDs, but the FK now targets profiles.

ALTER TABLE public.carts
  DROP CONSTRAINT IF EXISTS carts_customer_id_fkey;

ALTER TABLE public.carts
  ADD CONSTRAINT carts_customer_id_fkey
  FOREIGN KEY (customer_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

CREATE OR REPLACE VIEW public.cart_summary AS
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
  LEFT JOIN public.profiles      cp  ON cp.id  = c.customer_id
  LEFT JOIN public.admins        a   ON a.id   = c.processed_by
  LEFT JOIN public.profiles      ap  ON ap.id  = a.id
  LEFT JOIN public.cart_refund_status crs ON crs.cart_id = c.id;

DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    DROP POLICY IF EXISTS "customers_select" ON public.customers;
    DROP POLICY IF EXISTS "customers_insert" ON public.customers;
    DROP POLICY IF EXISTS "customers_delete" ON public.customers;
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.customers;
