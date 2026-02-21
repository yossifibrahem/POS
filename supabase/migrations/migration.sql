-- =============================================================================
-- MIGRATION: Introduce shared `profiles` table
--
-- Before: customers(id, full_name, email, phone)
--         admins(id, full_name)
--
-- After:  profiles(id, full_name, email, phone)   ← single source of truth
--         customers(id)                            ← role marker only
--         admins(id)                               ← role marker only
--
-- Safe to run on a live database — all steps are wrapped in a transaction.
-- Existing data is preserved and migrated automatically.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 1: Create the profiles table
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id         UUID                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name  TEXT                     NOT NULL,
  email      TEXT                     NOT NULL UNIQUE,
  phone      TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- STEP 2: Seed profiles from existing customers
--         Customers already have full_name, email, and phone — perfect source.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, email, phone, created_at, updated_at)
SELECT id, full_name, email, phone, created_at, updated_at
FROM   public.customers;

-- ---------------------------------------------------------------------------
-- STEP 3: Seed profiles from existing admins (those not already inserted)
--         Admins only had full_name; we pull email from auth.users.
--         phone defaults to NULL since it was never stored for admins.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, email, phone, created_at, updated_at)
SELECT
  a.id,
  a.full_name,
  u.email,        -- sourced from auth.users
  NULL,           -- no phone was stored for admins previously
  a.created_at,
  a.updated_at
FROM   public.admins  a
JOIN   auth.users     u ON u.id = a.id
WHERE  a.id NOT IN (SELECT id FROM public.profiles);  -- skip if already a customer

-- ---------------------------------------------------------------------------
-- STEP 4: Drop old columns from customers (data now lives in profiles)
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  DROP COLUMN full_name,
  DROP COLUMN email,
  DROP COLUMN phone,
  DROP COLUMN updated_at;

-- Re-point the FK: customers.id now references profiles instead of auth.users
-- (We can't ALTER the FK target directly, so we drop and recreate the constraint)
ALTER TABLE public.customers
  DROP CONSTRAINT customers_pkey CASCADE;  -- cascades to FK on carts.customer_id

-- Temporarily drop the carts FK so we can rebuild customers cleanly
ALTER TABLE public.carts
  DROP CONSTRAINT IF EXISTS carts_customer_id_fkey;

-- Restore customers PK, now pointing at profiles
ALTER TABLE public.customers
  ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

ALTER TABLE public.customers
  ADD CONSTRAINT customers_id_fkey
    FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Restore carts FK
ALTER TABLE public.carts
  ADD CONSTRAINT carts_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- STEP 5: Drop old columns from admins (full_name now lives in profiles)
-- ---------------------------------------------------------------------------
ALTER TABLE public.admins
  DROP COLUMN full_name,
  DROP COLUMN updated_at;

-- Re-point the FK: admins.id now references profiles instead of auth.users
ALTER TABLE public.admins
  DROP CONSTRAINT admins_pkey CASCADE;  -- cascades to FKs on carts and refunds

-- Temporarily drop dependent FKs
ALTER TABLE public.carts
  DROP CONSTRAINT IF EXISTS carts_processed_by_fkey;

ALTER TABLE public.refunds
  DROP CONSTRAINT IF EXISTS refunds_processed_by_fkey;

-- Restore admins PK, now pointing at profiles
ALTER TABLE public.admins
  ADD CONSTRAINT admins_pkey PRIMARY KEY (id);

ALTER TABLE public.admins
  ADD CONSTRAINT admins_id_fkey
    FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Restore dependent FKs
ALTER TABLE public.carts
  ADD CONSTRAINT carts_processed_by_fkey
    FOREIGN KEY (processed_by) REFERENCES public.admins(id) ON DELETE SET NULL;

ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_processed_by_fkey
    FOREIGN KEY (processed_by) REFERENCES public.admins(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- STEP 6: Add updated_at trigger to profiles
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Remove the now-orphaned triggers that fired on the dropped columns
DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
DROP TRIGGER IF EXISTS trg_admins_updated_at    ON public.admins;

-- ---------------------------------------------------------------------------
-- STEP 7: Enable RLS on profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING  (id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- STEP 8: Update views to join through profiles
-- ---------------------------------------------------------------------------

-- cart_summary: pull customer and admin names/email from profiles
CREATE OR REPLACE VIEW public.cart_summary AS
SELECT c.id,
       c.status,
       c.total,
       c.notes,
       c.created_at,
       c.updated_at,
       cp.full_name  AS customer_name,
       cp.email      AS customer_email,
       ap.full_name  AS processed_by_name,
       crs.refunded_amount,
       crs.net_amount,
       crs.refund_status
  FROM public.carts              c
  LEFT JOIN public.customers     cu  ON cu.id  = c.customer_id
  LEFT JOIN public.profiles      cp  ON cp.id  = cu.id
  LEFT JOIN public.admins        a   ON a.id   = c.processed_by
  LEFT JOIN public.profiles      ap  ON ap.id  = a.id
  LEFT JOIN public.cart_refund_status crs ON crs.cart_id = c.id;


-- refund_detail: pull admin name from profiles
CREATE OR REPLACE VIEW public.refund_detail AS
SELECT r.id              AS refund_id,
       r.cart_id,
       r.refund_amount,
       r.created_at      AS refunded_at,
       ap.full_name      AS processed_by_name,
       ri.id             AS refund_item_id,
       ri.sold_product_id,
       ri.quantity       AS refunded_quantity,
       ri.unit_price,
       ri.quantity * ri.unit_price AS refund_line_total,
       p.id              AS product_id,
       p.name            AS product_name
  FROM public.refunds      r
  LEFT JOIN public.admins        a  ON a.id  = r.processed_by
  LEFT JOIN public.profiles      ap ON ap.id = a.id
  JOIN      public.refund_items  ri ON ri.refund_id = r.id
  LEFT JOIN public.sold_products sp ON sp.id = ri.sold_product_id
  LEFT JOIN public.products      p  ON p.id  = sp.product_id;

-- ---------------------------------------------------------------------------
-- STEP 9: Update customers RLS — remove update policy (updates go to profiles)
--         and add a delete policy for admins
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "customers_update" ON public.customers;
DROP POLICY IF EXISTS "customers_insert" ON public.customers;

CREATE POLICY "customers_insert"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "customers_delete"
  ON public.customers FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- DONE
-- ---------------------------------------------------------------------------

COMMIT;