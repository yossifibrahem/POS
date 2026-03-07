-- =============================================================================
-- COMPLETE DATABASE SCHEMA (v4)
-- Includes: admin level hierarchy (high / med / low)
--
-- v4 changes vs v3:
--   • cart_summary view: added c.processed_by (UUID) column so the UI can
--     reference the admin's UUID directly without a separate query.
--     Useful for ownership checks in low-admin flows and joining on the
--     client side without re-fetching the carts table.
--
-- v3 changes vs v2:
--   • carts_update RLS policy extended: low admins can now update carts they
--     personally created (processed_by = auth.uid()), enabling the
--     pending → completed transition that auto-completes their own sales.
--     Med/high admins retain full update access to all carts.
--
-- Refund model: immutable refund ledger (refunds + refund_items)
-- Identity model: shared `profiles` table — customers and admins both reference
--                 it, so id / full_name / email / phone are never duplicated.
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
CREATE TABLE public.categories (
  id         UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT                     NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Category Attributes
-- Defines which attributes belong to a category and their type.
-- Used by the UI to know what fields to show/filter for each category.
-- ---------------------------------------------------------------------------
CREATE TABLE public.category_attributes (
  id             UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id    UUID                     NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name           TEXT                     NOT NULL,   -- JSON key,   e.g. "ram", "screen_size"
  label          TEXT                     NOT NULL,   -- UI display, e.g. "RAM", "Screen Size"
  attribute_type TEXT                     NOT NULL
                                           CHECK (attribute_type IN ('text', 'number', 'boolean', 'enum')),
  unit           TEXT,                                -- e.g. "GB", "inch" (display only)
  options        JSONB,                               -- enum only, e.g. ["4","8","12","16"]
  is_required    BOOLEAN                  NOT NULL DEFAULT false,
  display_order  INTEGER                  NOT NULL DEFAULT 0,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  UNIQUE (category_id, name)
);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
CREATE TABLE public.products (
  id          UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT                     NOT NULL,
  price       NUMERIC                  NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost        NUMERIC                  NOT NULL DEFAULT 0 CHECK (cost >= 0),
  category_id UUID                     REFERENCES public.categories(id) ON DELETE SET NULL,
  stock       INTEGER                  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active   BOOLEAN                  NOT NULL DEFAULT true,
  attributes  JSONB                    NOT NULL DEFAULT '{}', -- dynamic per-category attributes
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Profiles (linked to auth.users)
-- Single source of truth for identity fields shared by customers AND admins.
-- One row per auth user — created on sign-up regardless of role.
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
-- Customers (role table — references profiles)
-- A row here means the user has the "customer" role.
-- Identity data lives in profiles; no duplication.
-- ---------------------------------------------------------------------------
CREATE TABLE public.customers (
  id         UUID                     NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Admins (role table — references profiles)
-- A row here means the user has the "admin" role.
-- Identity data lives in profiles; no duplication.
--
-- level:
--   'high' → Full access to everything (default for existing/new admins)
--   'med'  → Full access except cannot see product cost or profit figures
--   'low'  → Can only create new sales and view their own sales history
-- ---------------------------------------------------------------------------
CREATE TABLE public.admins (
  id         UUID                     NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  level      TEXT                     NOT NULL DEFAULT 'high'
                                        CHECK (level IN ('high', 'med', 'low')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.admins.level IS
  'high = full access | med = no cost/profit visibility | low = new-sale + own history only';

-- ---------------------------------------------------------------------------
-- Carts
-- customer_id is nullable to support walk-in (in-person) sales.
-- 'refunded' is no longer a status — query the refunds table instead.
-- carts.total stores the original sale total (immutable once completed).
-- ---------------------------------------------------------------------------
CREATE TABLE public.carts (
  id           UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id  UUID                     REFERENCES public.customers(id) ON DELETE SET NULL,
  processed_by UUID                     REFERENCES public.admins(id) ON DELETE SET NULL,
  status       TEXT                     NOT NULL DEFAULT 'pending'
                                          CHECK (status IN ('pending', 'completed', 'cancelled')),
  total        NUMERIC                  NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes        TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Sold Products (line items)
-- Immutable once the cart is completed — never mutated after the sale.
-- Refunds are recorded in the refunds / refund_items tables.
-- ---------------------------------------------------------------------------
CREATE TABLE public.sold_products (
  id          UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id     UUID                     NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id  UUID                     REFERENCES public.products(id) ON DELETE SET NULL,
  quantity    INTEGER                  NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price  NUMERIC                  NOT NULL CHECK (unit_price >= 0),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Refunds
-- One record per refund event (a cart can have multiple over its lifetime).
-- refund_amount is the monetary total for this event, stored for fast lookup
-- and as a guard against item-level rounding drift.
-- ---------------------------------------------------------------------------
CREATE TABLE public.refunds (
  id            UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id       UUID                     NOT NULL REFERENCES public.carts(id),
  processed_by  UUID                     REFERENCES public.admins(id) ON DELETE SET NULL,
  refund_amount NUMERIC                  NOT NULL CHECK (refund_amount > 0),
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Refund Items
-- Line-level breakdown of what was returned in each refund event.
-- The trigger on INSERT handles restocking.
-- ---------------------------------------------------------------------------
CREATE TABLE public.refund_items (
  id              UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  refund_id       UUID    NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
  sold_product_id UUID    NOT NULL REFERENCES public.sold_products(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC NOT NULL CHECK (unit_price >= 0)
);


-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_category_attributes_category_id  ON public.category_attributes(category_id);

CREATE INDEX idx_products_category_id             ON public.products(category_id);
CREATE INDEX idx_products_is_active               ON public.products(is_active);
CREATE INDEX idx_products_attributes              ON public.products USING GIN (attributes);

CREATE INDEX idx_carts_customer_id                ON public.carts(customer_id);
CREATE INDEX idx_carts_processed_by               ON public.carts(processed_by);
CREATE INDEX idx_carts_status                     ON public.carts(status);

CREATE INDEX idx_sold_products_cart_id            ON public.sold_products(cart_id);
CREATE INDEX idx_sold_products_product_id         ON public.sold_products(product_id);

CREATE INDEX idx_refunds_cart_id                  ON public.refunds(cart_id);
CREATE INDEX idx_refunds_processed_by             ON public.refunds(processed_by);
CREATE INDEX idx_refund_items_refund_id           ON public.refund_items(refund_id);
CREATE INDEX idx_refund_items_sold_product_id     ON public.refund_items(sold_product_id);

CREATE INDEX idx_admins_level                     ON public.admins(level);


-- =============================================================================
-- HELPER FUNCTIONS  (SECURITY DEFINER prevents RLS recursion)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- is_admin  — TRUE for any admin regardless of level.
-- Kept stable so all existing RLS policies and application code work unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE id = _user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- get_admin_level  — Returns 'high' | 'med' | 'low' | NULL.
-- Called once on login by the frontend to populate the auth context.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_level(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT level FROM public.admins WHERE id = _user_id;
$$;

-- ---------------------------------------------------------------------------
-- is_admin_high  — TRUE only for high-level admins.
-- Used in policies that gate: promoting admins, editing other users' profiles,
-- deleting customer role rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_high(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE id = _user_id AND level = 'high'
  );
$$;

-- ---------------------------------------------------------------------------
-- is_admin_med_or_above  — TRUE for high OR med admins.
-- Used in policies that gate: product/category writes, refunds, cart updates,
-- viewing all carts, managing profiles, managing other admins.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_med_or_above(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE id = _user_id AND level IN ('high', 'med')
  );
$$;


-- =============================================================================
-- TRIGGER FUNCTION: updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_category_attributes_updated_at
  BEFORE UPDATE ON public.category_attributes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_sold_products_updated_at
  BEFORE UPDATE ON public.sold_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- TRIGGER FUNCTION: stock management (driven by cart status transitions)
--
--   pending   → completed : DEDUCT stock for all sold_products line items
--   pending   → cancelled : DELETE sold_products (stock was never deducted)
--   completed → cancelled : BLOCKED — insert a refund record instead
--
--   Stock is intentionally NOT touched on sold_products INSERT/DELETE so that
--   building / editing a pending cart never affects inventory.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.manage_stock_on_cart_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Block completed → cancelled (insert a refund record instead)
  IF OLD.status = 'completed' AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION
      'Cannot cancel a completed cart. Insert a refund record instead.';
  END IF;

  -- pending → completed : deduct stock for all line items
  IF OLD.status = 'pending' AND NEW.status = 'completed' THEN
    UPDATE public.products p
       SET stock = stock - sp.quantity
      FROM public.sold_products sp
     WHERE sp.cart_id    = NEW.id
       AND sp.product_id = p.id;

  -- pending → cancelled : delete line items (stock was never deducted)
  ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
    DELETE FROM public.sold_products WHERE cart_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manage_stock_on_cart_status_change
  AFTER UPDATE OF status ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.manage_stock_on_cart_status_change();


-- =============================================================================
-- TRIGGER FUNCTION: restock on refund_items INSERT
--
--   Fires once per refund line item inserted. Restores stock for the
--   product referenced by that sold_products row.
--
--   App flow for a refund:
--     1. INSERT INTO refunds  (cart_id, processed_by, refund_amount)
--     2. INSERT INTO refund_items (refund_id, sold_product_id, quantity, unit_price)
--        -- one row per returned line item; trigger handles restocking
-- =============================================================================

CREATE OR REPLACE FUNCTION public.restock_on_refund_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products p
     SET stock = stock + NEW.quantity
    FROM public.sold_products sp
   WHERE sp.id         = NEW.sold_product_id
     AND sp.product_id = p.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restock_on_refund_item
  AFTER INSERT ON public.refund_items
  FOR EACH ROW EXECUTE FUNCTION public.restock_on_refund_item();


-- =============================================================================
-- TRIGGER FUNCTION: cart total recalculation
--   carts.total = the original sale total (immutable after completion).
--   Net amount after refunds is computed via the cart_refund_status view.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_cart_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  v_cart_id := CASE TG_OP WHEN 'DELETE' THEN OLD.cart_id ELSE NEW.cart_id END;

  UPDATE public.carts
     SET total = COALESCE((
           SELECT SUM(quantity * unit_price)
             FROM public.sold_products
            WHERE cart_id = v_cart_id
         ), 0)
   WHERE id = v_cart_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_recalculate_cart_total
  AFTER INSERT OR UPDATE OR DELETE ON public.sold_products
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_cart_total();


-- =============================================================================
-- TRIGGER FUNCTION: clear product attributes when category is removed
--   When category_id is set to NULL (via ON DELETE SET NULL or manual update),
--   clear the attributes JSONB so stale keys don't linger.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.clear_product_attributes_on_category_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.category_id IS NOT NULL AND NEW.category_id IS NULL THEN
    NEW.attributes = '{}'::JSONB;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clear_product_attributes_on_category_delete
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
  EXECUTE FUNCTION public.clear_product_attributes_on_category_delete();


-- =============================================================================
-- VIEWS
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
--   Carts joined with customer profile, admin profile + level, refund status.
--   Includes admin_level so the UI can decide whether to show profit columns
--   without a separate query.
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- cart_line_items
--   sold_products joined with product name and total refunded quantity
--   aggregated across all refund events for that line item.
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
       p.cost             AS product_cost,       -- frontend hides this for med/low
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
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.refund_detail AS
SELECT r.id              AS refund_id,
       r.cart_id,
       r.refund_amount,
       r.created_at      AS refunded_at,
       ap.full_name      AS processed_by_name,
       a.level           AS processed_by_level,
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
-- admin_profiles
--   Convenience view joining admins with their profile data and level.
--   Use in the Profiles management page.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_profiles AS
SELECT a.id,
       a.level,
       a.created_at AS admin_since,
       p.full_name,
       p.email,
       p.phone
  FROM public.admins   a
  JOIN public.profiles p ON p.id = a.id;


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sold_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_items        ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Categories: public read, med/high write
-- ---------------------------------------------------------------------------
CREATE POLICY "categories_select"
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "categories_insert"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "categories_update"
  ON public.categories FOR UPDATE
  TO authenticated
  USING  (public.is_admin_med_or_above(auth.uid()))
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "categories_delete"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()));


-- ---------------------------------------------------------------------------
-- Category Attributes: public read, med/high write
-- ---------------------------------------------------------------------------
CREATE POLICY "category_attributes_select"
  ON public.category_attributes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "category_attributes_insert"
  ON public.category_attributes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "category_attributes_update"
  ON public.category_attributes FOR UPDATE
  TO authenticated
  USING  (public.is_admin_med_or_above(auth.uid()))
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "category_attributes_delete"
  ON public.category_attributes FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()));


-- ---------------------------------------------------------------------------
-- Products: active products publicly readable; all admins read all;
--           writes restricted to med/high
-- ---------------------------------------------------------------------------
CREATE POLICY "products_select"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "products_insert"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "products_update"
  ON public.products FOR UPDATE
  TO authenticated
  USING  (public.is_admin_med_or_above(auth.uid()))
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "products_delete"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()));


-- ---------------------------------------------------------------------------
-- Profiles: users see and update their own record
--           any admin can read all profiles
--           only high admins can update others' profiles
-- ---------------------------------------------------------------------------
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
  USING  (id = auth.uid() OR public.is_admin_high(auth.uid()))
  WITH CHECK (id = auth.uid() OR public.is_admin_high(auth.uid()));


-- ---------------------------------------------------------------------------
-- Customers: users see own row; all admins see all
--            only high admins can delete customer rows
-- ---------------------------------------------------------------------------
CREATE POLICY "customers_select"
  ON public.customers FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "customers_insert"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "customers_delete"
  ON public.customers FOR DELETE
  TO authenticated
  USING (public.is_admin_high(auth.uid()));


-- ---------------------------------------------------------------------------
-- Admins: all admins can read the table (to see roles/levels)
--         only high admins can insert or delete admin rows
--         (level updates use the update path handled by high admin in the UI)
-- ---------------------------------------------------------------------------
CREATE POLICY "admins_select"
  ON public.admins FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins_insert"
  ON public.admins FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_high(auth.uid()));

CREATE POLICY "admins_update"
  ON public.admins FOR UPDATE
  TO authenticated
  USING  (public.is_admin_high(auth.uid()))
  WITH CHECK (public.is_admin_high(auth.uid()));

CREATE POLICY "admins_delete"
  ON public.admins FOR DELETE
  TO authenticated
  USING (public.is_admin_high(auth.uid()));


-- ---------------------------------------------------------------------------
-- Carts:
--   SELECT — customers see own carts; med/high see all; low see only their own
--   INSERT — all admin levels (low admins must be able to create sales)
--   UPDATE — med/high can update any cart; low admins can update their own
--            carts only (required to transition pending → completed on sale)
--   DELETE — med/high only
-- ---------------------------------------------------------------------------
CREATE POLICY "carts_select"
  ON public.carts FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.is_admin_med_or_above(auth.uid())
    OR (public.is_admin(auth.uid()) AND processed_by = auth.uid())
  );

CREATE POLICY "carts_insert"
  ON public.carts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "carts_update"
  ON public.carts FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_med_or_above(auth.uid())
    OR (public.is_admin(auth.uid()) AND processed_by = auth.uid())
  )
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    OR (public.is_admin(auth.uid()) AND processed_by = auth.uid())
  );

CREATE POLICY "carts_delete"
  ON public.carts FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()));


-- ---------------------------------------------------------------------------
-- Sold Products:
--   SELECT — users see items on their own carts; SELECT via cart JOIN
--            naturally limits low admins to their own carts
--   INSERT — all admin levels (required to build a sale)
--   UPDATE/DELETE — med/high only
-- ---------------------------------------------------------------------------
CREATE POLICY "sold_products_select"
  ON public.sold_products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
       WHERE carts.id = sold_products.cart_id
         AND (
           carts.customer_id = auth.uid()
           OR public.is_admin_med_or_above(auth.uid())
           OR (public.is_admin(auth.uid()) AND carts.processed_by = auth.uid())
         )
    )
  );

CREATE POLICY "sold_products_insert"
  ON public.sold_products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "sold_products_update"
  ON public.sold_products FOR UPDATE
  TO authenticated
  USING  (public.is_admin_med_or_above(auth.uid()))
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "sold_products_delete"
  ON public.sold_products FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()));


-- ---------------------------------------------------------------------------
-- Refunds: low admins have no access at all
--   SELECT — customers see refunds on own carts; med/high see all
--   INSERT/DELETE — med/high only
-- ---------------------------------------------------------------------------
CREATE POLICY "refunds_select"
  ON public.refunds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
       WHERE carts.id = refunds.cart_id
         AND carts.customer_id = auth.uid()
    )
    OR public.is_admin_med_or_above(auth.uid())
  );

CREATE POLICY "refunds_insert"
  ON public.refunds FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "refunds_delete"
  ON public.refunds FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()));


-- ---------------------------------------------------------------------------
-- Refund Items: access inherited through refund → cart → customer
--   low admins have no access
-- ---------------------------------------------------------------------------
CREATE POLICY "refund_items_select"
  ON public.refund_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.refunds r
        JOIN public.carts   c ON c.id = r.cart_id
       WHERE r.id = refund_items.refund_id
         AND (
           c.customer_id = auth.uid()
           OR public.is_admin_med_or_above(auth.uid())
         )
    )
  );

CREATE POLICY "refund_items_insert"
  ON public.refund_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_med_or_above(auth.uid()));

CREATE POLICY "refund_items_delete"
  ON public.refund_items FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()));


-- =============================================================================
-- END OF SCHEMA
-- =============================================================================