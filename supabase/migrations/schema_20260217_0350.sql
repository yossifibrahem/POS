-- =============================================================================
-- COMPLETE DATABASE SCHEMA
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
-- Customers (linked to auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.customers (
  id         UUID                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name  TEXT                     NOT NULL,
  email      TEXT                     NOT NULL UNIQUE,
  phone      TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Admins (subset of customers)
-- ---------------------------------------------------------------------------
CREATE TABLE public.admins (
  id         UUID                     NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Carts
-- ---------------------------------------------------------------------------
CREATE TABLE public.carts (
  id           UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id  UUID                     NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  processed_by UUID                     REFERENCES public.admins(id) ON DELETE SET NULL,
  status       TEXT                     NOT NULL DEFAULT 'pending'
                                          CHECK (status IN ('pending', 'completed', 'refunded', 'cancelled')),
  total        NUMERIC                  NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes        TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Sold Products (line items)
-- ---------------------------------------------------------------------------
CREATE TABLE public.sold_products (
  id         UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id    UUID                     NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id UUID                     REFERENCES public.products(id) ON DELETE SET NULL,
  quantity   INTEGER                  NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC                  NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
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


-- =============================================================================
-- HELPER FUNCTION  (SECURITY DEFINER prevents RLS recursion)
-- =============================================================================

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

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_sold_products_updated_at
  BEFORE UPDATE ON public.sold_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- TRIGGER FUNCTION: stock management
--   Decrements stock on INSERT into sold_products.
--   Restores  stock on DELETE from sold_products (returns / cart deletion).
--   Adjusts   stock on UPDATE  (quantity change).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.manage_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products
       SET stock = stock - NEW.quantity
     WHERE id = NEW.product_id;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NOT NULL THEN
      UPDATE public.products
         SET stock = stock + OLD.quantity
       WHERE id = OLD.product_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.product_id IS DISTINCT FROM NEW.product_id THEN
      IF OLD.product_id IS NOT NULL THEN
        UPDATE public.products
           SET stock = stock + OLD.quantity
         WHERE id = OLD.product_id;
      END IF;
      IF NEW.product_id IS NOT NULL THEN
        UPDATE public.products
           SET stock = stock - NEW.quantity
         WHERE id = NEW.product_id;
      END IF;
    ELSE
      IF OLD.product_id IS NOT NULL THEN
        UPDATE public.products
           SET stock = stock - (NEW.quantity - OLD.quantity)
         WHERE id = NEW.product_id;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sold_products_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.sold_products
  FOR EACH ROW EXECUTE FUNCTION public.manage_product_stock();


-- =============================================================================
-- TRIGGER FUNCTION: cart total
--   Recalculates carts.total whenever a sold_products row is inserted,
--   updated, or deleted, keeping the stored total always accurate.
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
  IF TG_OP = 'DELETE' THEN
    v_cart_id := OLD.cart_id;
  ELSE
    v_cart_id := NEW.cart_id;
  END IF;

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
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sold_products       ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Categories: public read, admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "categories_select"
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "categories_insert"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "categories_update"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "categories_delete"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));


-- ---------------------------------------------------------------------------
-- Category Attributes: public read, admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "category_attributes_select"
  ON public.category_attributes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "category_attributes_insert"
  ON public.category_attributes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "category_attributes_update"
  ON public.category_attributes FOR UPDATE
  TO authenticated
  USING  (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "category_attributes_delete"
  ON public.category_attributes FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));


-- ---------------------------------------------------------------------------
-- Products: active products are publicly readable, admin full write
-- ---------------------------------------------------------------------------
CREATE POLICY "products_select"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "products_insert"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "products_update"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "products_delete"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));


-- ---------------------------------------------------------------------------
-- Customers: users see own record, admins see all
-- ---------------------------------------------------------------------------
CREATE POLICY "customers_select"
  ON public.customers FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "customers_insert"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "customers_update"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));


-- ---------------------------------------------------------------------------
-- Admins: admins only
-- ---------------------------------------------------------------------------
CREATE POLICY "admins_select"
  ON public.admins FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins_insert"
  ON public.admins FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins_delete"
  ON public.admins FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));


-- ---------------------------------------------------------------------------
-- Carts: users see own carts, admins full access
-- ---------------------------------------------------------------------------
CREATE POLICY "carts_select"
  ON public.carts FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "carts_insert"
  ON public.carts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "carts_update"
  ON public.carts FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "carts_delete"
  ON public.carts FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));


-- ---------------------------------------------------------------------------
-- Sold Products: users see own (via cart), admins full access
-- ---------------------------------------------------------------------------
CREATE POLICY "sold_products_select"
  ON public.sold_products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
       WHERE carts.id = sold_products.cart_id
         AND (carts.customer_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "sold_products_insert"
  ON public.sold_products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "sold_products_update"
  ON public.sold_products FOR UPDATE
  TO authenticated
  USING  (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "sold_products_delete"
  ON public.sold_products FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
