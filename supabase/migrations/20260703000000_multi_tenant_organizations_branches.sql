-- =============================================================================
-- Multi-tenant conversion: organizations + branches
-- Existing single-tenant data is migrated into MHG / Main.
-- Catalog rows are organization-owned; sales and stock are branch-owned.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core tenant tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id            UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT                     NOT NULL,
  contact_email TEXT,
  phone         TEXT,
  address       TEXT,
  currency_code TEXT                     NOT NULL DEFAULT 'USD' CHECK (char_length(currency_code) = 3),
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branches (
  id              UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID                     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT                     NOT NULL,
  address         TEXT,
  phone           TEXT,
  is_active       BOOLEAN                  NOT NULL DEFAULT true,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id)
);

-- ---------------------------------------------------------------------------
-- Add tenant ownership to existing tables.
-- products.stock is retained as a legacy column for non-destructive migration,
-- but the app now reads/writes stock through branch_product_inventory.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.carts
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.branch_product_inventory (
  branch_id  UUID                     NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID                     NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stock      INTEGER                  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  PRIMARY KEY (branch_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Seed MHG / Main and move existing data into it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org_id UUID;
  v_branch_id UUID;
BEGIN
  SELECT id INTO v_org_id
    FROM public.organizations
   WHERE name = 'MHG'
   ORDER BY created_at
   LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name)
    VALUES ('MHG')
    RETURNING id INTO v_org_id;
  END IF;

  SELECT id INTO v_branch_id
    FROM public.branches
   WHERE organization_id = v_org_id
     AND name = 'Main'
   ORDER BY created_at
   LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO public.branches (organization_id, name)
    VALUES (v_org_id, 'Main')
    RETURNING id INTO v_branch_id;
  END IF;

  UPDATE public.profiles
     SET organization_id = COALESCE(organization_id, v_org_id);

  UPDATE public.admins
     SET organization_id = COALESCE(organization_id, v_org_id),
         branch_id = CASE
           WHEN level = 'high' THEN branch_id
           ELSE COALESCE(branch_id, v_branch_id)
         END;

  UPDATE public.categories
     SET organization_id = COALESCE(organization_id, v_org_id);

  UPDATE public.products
     SET organization_id = COALESCE(organization_id, v_org_id);

  UPDATE public.carts
     SET branch_id = COALESCE(branch_id, v_branch_id);

  INSERT INTO public.branch_product_inventory (branch_id, product_id, stock)
  SELECT v_branch_id, p.id, p.stock
    FROM public.products p
  ON CONFLICT (branch_id, product_id)
  DO UPDATE SET stock = EXCLUDED.stock,
                updated_at = now();
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.admins
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.categories
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.carts
  ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.admins
  DROP CONSTRAINT IF EXISTS admins_level_branch_scope_check,
  ADD CONSTRAINT admins_level_branch_scope_check
    CHECK (
      (level = 'high' AND branch_id IS NULL)
      OR (level IN ('med', 'low') AND branch_id IS NOT NULL)
    );

ALTER TABLE public.admins
  DROP CONSTRAINT IF EXISTS admins_branch_organization_fkey,
  ADD CONSTRAINT admins_branch_organization_fkey
    FOREIGN KEY (branch_id, organization_id)
    REFERENCES public.branches(id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_name_key;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_organization_name_key,
  ADD CONSTRAINT categories_organization_name_key UNIQUE (organization_id, name),
  DROP CONSTRAINT IF EXISTS categories_id_organization_id_key,
  ADD CONSTRAINT categories_id_organization_id_key UNIQUE (id, organization_id);

COMMENT ON COLUMN public.products.stock IS
  'Legacy single-tenant stock column retained for backwards-compatible migration only. Use branch_product_inventory.stock.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_admins_organization_id ON public.admins(organization_id);
CREATE INDEX IF NOT EXISTS idx_admins_branch_id ON public.admins(branch_id);
CREATE INDEX IF NOT EXISTS idx_categories_organization_id ON public.categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_organization_id ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_carts_branch_id ON public.carts(branch_id);
CREATE INDEX IF NOT EXISTS idx_branches_organization_id ON public.branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_branch_product_inventory_product_id ON public.branch_product_inventory(product_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_branch_product_inventory_updated_at
  BEFORE UPDATE ON public.branch_product_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tenant helper functions. SECURITY DEFINER avoids RLS recursion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.admins WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_branch_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.admins WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_profile_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_branch_organization_id(_branch_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.branches WHERE id = _branch_id;
$$;

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

CREATE OR REPLACE FUNCTION public.get_admin_level(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT level FROM public.admins WHERE id = _user_id;
$$;

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

CREATE OR REPLACE FUNCTION public.can_access_organization(_user_id UUID, _organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.admins a
     WHERE a.id = _user_id
       AND a.organization_id = _organization_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id UUID, _branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.admins a
      JOIN public.branches b ON b.id = _branch_id
     WHERE a.id = _user_id
       AND a.organization_id = b.organization_id
       AND (
         a.level = 'high'
         OR a.branch_id = _branch_id
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_assignment_is_valid(
  _organization_id UUID,
  _branch_id UUID,
  _level TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _level = 'high' THEN _organization_id IS NOT NULL AND _branch_id IS NULL
    WHEN _level IN ('med', 'low') THEN EXISTS (
      SELECT 1
        FROM public.branches b
       WHERE b.id = _branch_id
         AND b.organization_id = _organization_id
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.profile_matches_branch(_profile_id UUID, _branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _profile_id IS NULL
    OR EXISTS (
      SELECT 1
        FROM public.profiles p
        JOIN public.branches b ON b.id = _branch_id
       WHERE p.id = _profile_id
         AND p.organization_id = b.organization_id
    );
$$;

CREATE OR REPLACE FUNCTION public.branch_product_matches(_branch_id UUID, _product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.branches b
      JOIN public.products p ON p.id = _product_id
     WHERE b.id = _branch_id
       AND b.organization_id = p.organization_id
  );
$$;

CREATE OR REPLACE FUNCTION public.product_category_matches(_organization_id UUID, _category_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _category_id IS NULL
    OR EXISTS (
      SELECT 1
        FROM public.categories c
       WHERE c.id = _category_id
         AND c.organization_id = _organization_id
    );
$$;

CREATE OR REPLACE FUNCTION public.get_admin_context(_user_id UUID)
RETURNS TABLE (
  id UUID,
  level TEXT,
  organization_id UUID,
  organization_name TEXT,
  branch_id UUID,
  branch_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         a.level,
         a.organization_id,
         o.name AS organization_name,
         a.branch_id,
         b.name AS branch_name
    FROM public.admins a
    JOIN public.organizations o ON o.id = a.organization_id
    LEFT JOIN public.branches b ON b.id = a.branch_id
   WHERE a.id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.ping_admin_presence()
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  UPDATE public.admins
     SET last_seen_at = v_now
   WHERE id = auth.uid();

  RETURN v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_online_admins()
RETURNS TABLE (
  id           UUID,
  full_name    TEXT,
  level        TEXT,
  last_seen_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         p.full_name,
         a.level,
         a.last_seen_at
    FROM public.admins   a
    JOIN public.profiles p ON p.id = a.id
   WHERE a.last_seen_at > now() - INTERVAL '5 minutes'
     AND public.can_access_organization(auth.uid(), a.organization_id)
   ORDER BY a.last_seen_at DESC;
$$;

-- ---------------------------------------------------------------------------
-- Auth provisioning: owner signup creates org + first branch + high admin.
-- Non-owner signups fall back to MHG for backwards compatibility.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_full_name TEXT;
  profile_email TEXT;
  profile_phone TEXT;
  requested_org_name TEXT;
  requested_branch_name TEXT;
  target_org_id UUID;
  target_branch_id UUID;
BEGIN
  profile_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
    SPLIT_PART(COALESCE(NEW.email, ''), '@', 1),
    'User'
  );

  profile_email := COALESCE(
    NULLIF(TRIM(NEW.email), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'email'), '')
  );

  profile_phone := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data ->> 'phone',
    ''
  )), '');

  requested_org_name := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data ->> 'organization_name',
    ''
  )), '');

  requested_branch_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'branch_name'), ''),
    'Main'
  );

  IF requested_org_name IS NOT NULL THEN
    INSERT INTO public.organizations (name, contact_email)
    VALUES (requested_org_name, profile_email)
    RETURNING id INTO target_org_id;

    INSERT INTO public.branches (organization_id, name)
    VALUES (target_org_id, requested_branch_name)
    RETURNING id INTO target_branch_id;
  ELSE
    SELECT id INTO target_org_id
      FROM public.organizations
     WHERE name = 'MHG'
     ORDER BY created_at
     LIMIT 1;

    IF target_org_id IS NULL THEN
      INSERT INTO public.organizations (name)
      VALUES ('MHG')
      RETURNING id INTO target_org_id;
    END IF;

    SELECT id INTO target_branch_id
      FROM public.branches
     WHERE organization_id = target_org_id
       AND name = 'Main'
     ORDER BY created_at
     LIMIT 1;

    IF target_branch_id IS NULL THEN
      INSERT INTO public.branches (organization_id, name)
      VALUES (target_org_id, 'Main')
      RETURNING id INTO target_branch_id;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone, organization_id)
  VALUES (NEW.id, profile_full_name, profile_email, profile_phone, target_org_id)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        organization_id = COALESCE(public.profiles.organization_id, EXCLUDED.organization_id);

  IF requested_org_name IS NOT NULL THEN
    INSERT INTO public.admins (id, level, organization_id, branch_id)
    VALUES (NEW.id, 'high', target_org_id, NULL)
    ON CONFLICT (id) DO UPDATE
      SET level = 'high',
          organization_id = EXCLUDED.organization_id,
          branch_id = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_create_profile ON auth.users;

CREATE TRIGGER trg_auth_users_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Ensure branch stock rows never connect a branch to another org's product.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_branch_inventory_matches_product_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.branch_product_matches(NEW.branch_id, NEW.product_id) THEN
    RAISE EXCEPTION 'Branch inventory product must belong to the same organization as the branch.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_inventory_org_match ON public.branch_product_inventory;
CREATE TRIGGER trg_branch_inventory_org_match
  BEFORE INSERT OR UPDATE ON public.branch_product_inventory
  FOR EACH ROW EXECUTE FUNCTION public.ensure_branch_inventory_matches_product_org();

CREATE OR REPLACE FUNCTION public.ensure_product_category_matches_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.product_category_matches(NEW.organization_id, NEW.category_id) THEN
    RAISE EXCEPTION 'Product category must belong to the same organization as the product.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_category_org_match ON public.products;
CREATE TRIGGER trg_product_category_org_match
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.ensure_product_category_matches_org();

-- =============================================================================
-- Views
-- =============================================================================

DROP VIEW IF EXISTS public.refund_detail;
DROP VIEW IF EXISTS public.cart_line_items;
DROP VIEW IF EXISTS public.cart_summary;
DROP VIEW IF EXISTS public.cart_refund_status;
DROP VIEW IF EXISTS public.products_with_branch_stock;
DROP VIEW IF EXISTS public.admin_profiles;

CREATE OR REPLACE VIEW public.cart_refund_status
WITH (security_invoker = true)
AS
SELECT c.id AS cart_id,
       c.total AS sale_total,
       COALESCE(SUM(r.refund_amount), 0) AS refunded_amount,
       c.total - COALESCE(SUM(r.refund_amount), 0) AS net_amount,
       CASE
         WHEN COALESCE(SUM(r.refund_amount), 0) = 0 THEN 'not_refunded'
         WHEN COALESCE(SUM(r.refund_amount), 0) >= c.total THEN 'fully_refunded'
         ELSE 'partially_refunded'
       END AS refund_status
  FROM public.carts c
  LEFT JOIN public.refunds r ON r.cart_id = c.id
 GROUP BY c.id, c.total;

CREATE OR REPLACE VIEW public.cart_summary
WITH (security_invoker = true)
AS
SELECT c.id,
       c.branch_id,
       b.name       AS branch_name,
       c.status,
       c.total,
       c.notes,
       c.created_at,
       c.updated_at,
       c.processed_by,
       cp.full_name AS customer_name,
       cp.email     AS customer_email,
       ap.full_name AS processed_by_name,
       a.level      AS processed_by_level,
       crs.refunded_amount,
       crs.net_amount,
       crs.refund_status
  FROM public.carts c
  LEFT JOIN public.branches b ON b.id = c.branch_id
  LEFT JOIN public.profiles cp ON cp.id = c.customer_id
  LEFT JOIN public.admins a ON a.id = c.processed_by
  LEFT JOIN public.profiles ap ON ap.id = a.id
  LEFT JOIN public.cart_refund_status crs ON crs.cart_id = c.id;

CREATE OR REPLACE VIEW public.cart_line_items
WITH (security_invoker = true)
AS
SELECT sp.id AS sold_product_id,
       sp.cart_id,
       c.branch_id,
       sp.quantity AS sold_quantity,
       sp.unit_price,
       sp.quantity * sp.unit_price AS line_total,
       COALESCE(ri_agg.refunded_quantity, 0) AS refunded_quantity,
       (sp.quantity - COALESCE(ri_agg.refunded_quantity, 0)) * sp.unit_price AS net_line_total,
       p.id AS product_id,
       p.name AS product_name,
       p.cost AS product_cost,
       p.price AS product_price,
       p.attributes AS product_attributes
  FROM public.sold_products sp
  JOIN public.carts c ON c.id = sp.cart_id
  LEFT JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN (
    SELECT ri.sold_product_id,
           SUM(ri.quantity) AS refunded_quantity
      FROM public.refund_items ri
     GROUP BY ri.sold_product_id
  ) ri_agg ON ri_agg.sold_product_id = sp.id;

CREATE OR REPLACE VIEW public.refund_detail
WITH (security_invoker = true)
AS
SELECT r.id AS refund_id,
       r.cart_id,
       c.branch_id,
       r.refund_amount,
       r.created_at AS refunded_at,
       ap.full_name AS processed_by_name,
       a.level AS processed_by_level,
       ri.id AS refund_item_id,
       ri.sold_product_id,
       ri.quantity AS refunded_quantity,
       ri.unit_price,
       ri.quantity * ri.unit_price AS refund_line_total,
       p.id AS product_id,
       p.name AS product_name
  FROM public.refunds r
  JOIN public.carts c ON c.id = r.cart_id
  LEFT JOIN public.admins a ON a.id = r.processed_by
  LEFT JOIN public.profiles ap ON ap.id = a.id
  JOIN public.refund_items ri ON ri.refund_id = r.id
  LEFT JOIN public.sold_products sp ON sp.id = ri.sold_product_id
  LEFT JOIN public.products p ON p.id = sp.product_id;

CREATE OR REPLACE VIEW public.admin_profiles
WITH (security_invoker = true)
AS
SELECT a.id,
       a.level,
       a.organization_id,
       o.name AS organization_name,
       a.branch_id,
       b.name AS branch_name,
       a.created_at AS admin_since,
       a.last_seen_at,
       (a.last_seen_at > now() - INTERVAL '5 minutes') AS is_online,
       p.full_name,
       p.email,
       p.phone
  FROM public.admins a
  JOIN public.organizations o ON o.id = a.organization_id
  LEFT JOIN public.branches b ON b.id = a.branch_id
  JOIN public.profiles p ON p.id = a.id;

CREATE OR REPLACE VIEW public.products_with_branch_stock
WITH (security_invoker = true)
AS
SELECT p.id,
       p.organization_id,
       b.id AS branch_id,
       b.name AS branch_name,
       p.name,
       p.price,
       p.cost,
       p.category_id,
       c.name AS category_name,
       COALESCE(bpi.stock, 0) AS stock,
       p.is_active,
       p.attributes,
       p.created_at,
       p.updated_at
  FROM public.products p
  JOIN public.branches b ON b.organization_id = p.organization_id
  LEFT JOIN public.branch_product_inventory bpi
    ON bpi.branch_id = b.id
   AND bpi.product_id = p.id
  LEFT JOIN public.categories c ON c.id = p.category_id
 WHERE b.is_active = true;

-- =============================================================================
-- Row-level security
-- =============================================================================

ALTER TABLE public.organizations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_product_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON public.categories;
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;
DROP POLICY IF EXISTS "categories_delete" ON public.categories;
DROP POLICY IF EXISTS "category_attributes_select" ON public.category_attributes;
DROP POLICY IF EXISTS "category_attributes_insert" ON public.category_attributes;
DROP POLICY IF EXISTS "category_attributes_update" ON public.category_attributes;
DROP POLICY IF EXISTS "category_attributes_delete" ON public.category_attributes;
DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;
DROP POLICY IF EXISTS "products_delete" ON public.products;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
DROP POLICY IF EXISTS "admins_select" ON public.admins;
DROP POLICY IF EXISTS "admins_insert" ON public.admins;
DROP POLICY IF EXISTS "admins_update" ON public.admins;
DROP POLICY IF EXISTS "admins_delete" ON public.admins;
DROP POLICY IF EXISTS "carts_select" ON public.carts;
DROP POLICY IF EXISTS "carts_insert" ON public.carts;
DROP POLICY IF EXISTS "carts_update" ON public.carts;
DROP POLICY IF EXISTS "carts_delete" ON public.carts;
DROP POLICY IF EXISTS "sold_products_select" ON public.sold_products;
DROP POLICY IF EXISTS "sold_products_insert" ON public.sold_products;
DROP POLICY IF EXISTS "sold_products_update" ON public.sold_products;
DROP POLICY IF EXISTS "sold_products_delete" ON public.sold_products;
DROP POLICY IF EXISTS "refunds_select" ON public.refunds;
DROP POLICY IF EXISTS "refunds_insert" ON public.refunds;
DROP POLICY IF EXISTS "refunds_delete" ON public.refunds;
DROP POLICY IF EXISTS "refund_items_select" ON public.refund_items;
DROP POLICY IF EXISTS "refund_items_insert" ON public.refund_items;
DROP POLICY IF EXISTS "refund_items_delete" ON public.refund_items;

CREATE POLICY "organizations_select"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.can_access_organization(auth.uid(), id));

CREATE POLICY "organizations_update"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), id))
  WITH CHECK (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), id));

CREATE POLICY "branches_select"
  ON public.branches FOR SELECT
  TO authenticated
  USING (public.can_access_branch(auth.uid(), id));

CREATE POLICY "branches_insert"
  ON public.branches FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "branches_update"
  ON public.branches FOR UPDATE
  TO authenticated
  USING (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id))
  WITH CHECK (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "branches_delete"
  ON public.branches FOR DELETE
  TO authenticated
  USING (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "categories_select"
  ON public.categories FOR SELECT
  TO authenticated
  USING (public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "categories_insert"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_med_or_above(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "categories_update"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id))
  WITH CHECK (public.is_admin_med_or_above(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "categories_delete"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "category_attributes_select"
  ON public.category_attributes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.categories c
       WHERE c.id = category_attributes.category_id
         AND public.can_access_organization(auth.uid(), c.organization_id)
    )
  );

CREATE POLICY "category_attributes_insert"
  ON public.category_attributes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.categories c
       WHERE c.id = category_attributes.category_id
         AND public.can_access_organization(auth.uid(), c.organization_id)
    )
  );

CREATE POLICY "category_attributes_update"
  ON public.category_attributes FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.categories c
       WHERE c.id = category_attributes.category_id
         AND public.can_access_organization(auth.uid(), c.organization_id)
    )
  )
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.categories c
       WHERE c.id = category_attributes.category_id
         AND public.can_access_organization(auth.uid(), c.organization_id)
    )
  );

CREATE POLICY "category_attributes_delete"
  ON public.category_attributes FOR DELETE
  TO authenticated
  USING (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.categories c
       WHERE c.id = category_attributes.category_id
         AND public.can_access_organization(auth.uid(), c.organization_id)
    )
  );

CREATE POLICY "products_select"
  ON public.products FOR SELECT
  TO authenticated
  USING (
    public.can_access_organization(auth.uid(), organization_id)
    OR EXISTS (
      SELECT 1
        FROM public.sold_products sp
        JOIN public.carts c ON c.id = sp.cart_id
       WHERE sp.product_id = products.id
         AND c.customer_id = auth.uid()
    )
  );

CREATE POLICY "products_insert"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND public.can_access_organization(auth.uid(), organization_id)
    AND public.product_category_matches(organization_id, category_id)
  );

CREATE POLICY "products_update"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id))
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND public.can_access_organization(auth.uid(), organization_id)
    AND public.product_category_matches(organization_id, category_id)
  );

CREATE POLICY "products_delete"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "branch_product_inventory_select"
  ON public.branch_product_inventory FOR SELECT
  TO authenticated
  USING (public.can_access_branch(auth.uid(), branch_id));

CREATE POLICY "branch_product_inventory_insert"
  ON public.branch_product_inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND public.can_access_branch(auth.uid(), branch_id)
    AND public.branch_product_matches(branch_id, product_id)
  );

CREATE POLICY "branch_product_inventory_update"
  ON public.branch_product_inventory FOR UPDATE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id))
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND public.can_access_branch(auth.uid(), branch_id)
    AND public.branch_product_matches(branch_id, product_id)
  );

CREATE POLICY "branch_product_inventory_delete"
  ON public.branch_product_inventory FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND organization_id IS NOT NULL);

CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id))
  )
  WITH CHECK (
    (
      id = auth.uid()
      AND organization_id = public.get_profile_organization_id(auth.uid())
    )
    OR (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id))
  );

CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    id <> auth.uid()
    AND public.is_admin_high(auth.uid())
    AND public.can_access_organization(auth.uid(), organization_id)
  );

CREATE POLICY "admins_select"
  ON public.admins FOR SELECT
  TO authenticated
  USING (public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "admins_insert"
  ON public.admins FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_high(auth.uid())
    AND public.can_access_organization(auth.uid(), organization_id)
    AND public.admin_assignment_is_valid(organization_id, branch_id, level)
  );

CREATE POLICY "admins_update"
  ON public.admins FOR UPDATE
  TO authenticated
  USING (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id))
  WITH CHECK (
    public.is_admin_high(auth.uid())
    AND public.can_access_organization(auth.uid(), organization_id)
    AND public.admin_assignment_is_valid(organization_id, branch_id, level)
  );

CREATE POLICY "admins_delete"
  ON public.admins FOR DELETE
  TO authenticated
  USING (public.is_admin_high(auth.uid()) AND public.can_access_organization(auth.uid(), organization_id));

CREATE POLICY "carts_select"
  ON public.carts FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.can_access_branch(auth.uid(), branch_id)
  );

CREATE POLICY "carts_insert"
  ON public.carts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND public.can_access_branch(auth.uid(), branch_id)
    AND public.profile_matches_branch(customer_id, branch_id)
  );

CREATE POLICY "carts_update"
  ON public.carts FOR UPDATE
  TO authenticated
  USING (
    public.can_access_branch(auth.uid(), branch_id)
    AND (
      public.is_admin_med_or_above(auth.uid())
      OR processed_by = auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_branch(auth.uid(), branch_id)
    AND public.profile_matches_branch(customer_id, branch_id)
    AND (
      public.is_admin_med_or_above(auth.uid())
      OR processed_by = auth.uid()
    )
  );

CREATE POLICY "carts_delete"
  ON public.carts FOR DELETE
  TO authenticated
  USING (public.is_admin_med_or_above(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));

CREATE POLICY "sold_products_select"
  ON public.sold_products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
       WHERE c.id = sold_products.cart_id
         AND (
           c.customer_id = auth.uid()
           OR public.can_access_branch(auth.uid(), c.branch_id)
         )
    )
  );

CREATE POLICY "sold_products_insert"
  ON public.sold_products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts c
       WHERE c.id = sold_products.cart_id
         AND public.can_access_branch(auth.uid(), c.branch_id)
    )
  );

CREATE POLICY "sold_products_update"
  ON public.sold_products FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.carts c
       WHERE c.id = sold_products.cart_id
         AND public.can_access_branch(auth.uid(), c.branch_id)
    )
  )
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.carts c
       WHERE c.id = sold_products.cart_id
         AND public.can_access_branch(auth.uid(), c.branch_id)
    )
  );

CREATE POLICY "sold_products_delete"
  ON public.sold_products FOR DELETE
  TO authenticated
  USING (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.carts c
       WHERE c.id = sold_products.cart_id
         AND public.can_access_branch(auth.uid(), c.branch_id)
    )
  );

CREATE POLICY "refunds_select"
  ON public.refunds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
       WHERE c.id = refunds.cart_id
         AND (
           c.customer_id = auth.uid()
           OR (public.is_admin_med_or_above(auth.uid()) AND public.can_access_branch(auth.uid(), c.branch_id))
         )
    )
  );

CREATE POLICY "refunds_insert"
  ON public.refunds FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.carts c
       WHERE c.id = refunds.cart_id
         AND public.can_access_branch(auth.uid(), c.branch_id)
    )
  );

CREATE POLICY "refunds_delete"
  ON public.refunds FOR DELETE
  TO authenticated
  USING (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.carts c
       WHERE c.id = refunds.cart_id
         AND public.can_access_branch(auth.uid(), c.branch_id)
    )
  );

CREATE POLICY "refund_items_select"
  ON public.refund_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.refunds r
        JOIN public.carts c ON c.id = r.cart_id
       WHERE r.id = refund_items.refund_id
         AND (
           c.customer_id = auth.uid()
           OR (public.is_admin_med_or_above(auth.uid()) AND public.can_access_branch(auth.uid(), c.branch_id))
         )
    )
  );

CREATE POLICY "refund_items_insert"
  ON public.refund_items FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.refunds r
        JOIN public.carts c ON c.id = r.cart_id
       WHERE r.id = refund_items.refund_id
         AND public.can_access_branch(auth.uid(), c.branch_id)
    )
  );

CREATE POLICY "refund_items_delete"
  ON public.refund_items FOR DELETE
  TO authenticated
  USING (
    public.is_admin_med_or_above(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.refunds r
        JOIN public.carts c ON c.id = r.cart_id
       WHERE r.id = refund_items.refund_id
         AND public.can_access_branch(auth.uid(), c.branch_id)
    )
  );

-- =============================================================================
-- END
-- =============================================================================
