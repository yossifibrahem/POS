-- =============================================================================
-- MIGRATION: Replace mutating refund pattern with immutable refund ledger
--
-- What this migration does (in safe order):
--   1. Drop old triggers / functions that depend on removed columns
--   2. Create refunds + refund_items tables
--   3. Migrate any existing refund state into the new tables
--   4. Drop refunded_quantity and status from sold_products
--   5. Remove 'refunded' from carts.status CHECK and update any rows
--   6. Recreate the cart total trigger (no longer subtracts refunded_quantity)
--   7. Recreate cart status trigger (no refunded branch)
--   8. Add new restock trigger on refund_items INSERT
--   9. Add indexes + RLS policies for new tables
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1 – Drop old triggers and functions
-- ---------------------------------------------------------------------------

-- Fires on sold_products.refunded_quantity changes — column is going away
DROP TRIGGER IF EXISTS trg_restock_on_sold_product_refund ON public.sold_products;
DROP FUNCTION IF EXISTS public.restock_on_sold_product_refund();

-- Fires on sold_products changes — we'll recreate with updated total logic
DROP TRIGGER IF EXISTS trg_recalculate_cart_total ON public.sold_products;
DROP FUNCTION IF EXISTS public.recalculate_cart_total();

-- Fires on cart status change — we'll recreate without the refunded branch
DROP TRIGGER IF EXISTS trg_manage_stock_on_cart_status_change ON public.carts;
DROP FUNCTION IF EXISTS public.manage_stock_on_cart_status_change();


-- ---------------------------------------------------------------------------
-- Step 2 – Create refunds and refund_items
-- ---------------------------------------------------------------------------

CREATE TABLE public.refunds (
  id            UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id       UUID                     NOT NULL REFERENCES public.carts(id),
  processed_by  UUID                     REFERENCES public.admins(id) ON DELETE SET NULL,
  refund_amount NUMERIC                  NOT NULL CHECK (refund_amount > 0),
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.refund_items (
  id              UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  refund_id       UUID    NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
  sold_product_id UUID    NOT NULL REFERENCES public.sold_products(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC NOT NULL CHECK (unit_price >= 0)
);


-- ---------------------------------------------------------------------------
-- Step 3 – Migrate existing refund state
--
-- For every sold_products row that had refunded_quantity > 0, synthesise a
-- refund record so history is preserved. One refund per cart, one refund_item
-- per sold_products row that was (partially) refunded.
-- processed_by is inherited from carts.processed_by (best available proxy).
-- ---------------------------------------------------------------------------

WITH refunded_carts AS (
  SELECT DISTINCT c.id AS cart_id,
                  c.processed_by
    FROM public.carts         c
    JOIN public.sold_products sp ON sp.cart_id = c.id
   WHERE sp.refunded_quantity > 0
),
inserted_refunds AS (
  INSERT INTO public.refunds (cart_id, processed_by, refund_amount)
  SELECT rc.cart_id,
         rc.processed_by,
         COALESCE((
           SELECT SUM(sp2.refunded_quantity * sp2.unit_price)
             FROM public.sold_products sp2
            WHERE sp2.cart_id = rc.cart_id
              AND sp2.refunded_quantity > 0
         ), 0)
    FROM refunded_carts rc
  RETURNING id AS refund_id, cart_id
)
INSERT INTO public.refund_items (refund_id, sold_product_id, quantity, unit_price)
SELECT ir.refund_id,
       sp.id,
       sp.refunded_quantity,
       sp.unit_price
  FROM inserted_refunds    ir
  JOIN public.sold_products sp ON sp.cart_id = ir.cart_id
 WHERE sp.refunded_quantity > 0;


-- ---------------------------------------------------------------------------
-- Step 4 – Remove old refund columns from sold_products
-- ---------------------------------------------------------------------------

ALTER TABLE public.sold_products
  DROP CONSTRAINT IF EXISTS chk_refunded_quantity_lte_quantity;

ALTER TABLE public.sold_products
  DROP COLUMN IF EXISTS refunded_quantity,
  DROP COLUMN IF EXISTS status;

DROP INDEX IF EXISTS idx_sold_products_status;


-- ---------------------------------------------------------------------------
-- Step 5 – Remove 'refunded' from carts.status
--
-- Carts at 'refunded' become 'completed' — refund detail is in refunds table.
-- ---------------------------------------------------------------------------

UPDATE public.carts
   SET status = 'completed'
 WHERE status = 'refunded';

ALTER TABLE public.carts
  DROP CONSTRAINT IF EXISTS carts_status_check;

ALTER TABLE public.carts
  ADD CONSTRAINT carts_status_check
    CHECK (status IN ('pending', 'completed', 'cancelled'));


-- ---------------------------------------------------------------------------
-- Step 6 – Recreate cart total trigger
--   Total is now the immutable sale total (SUM of quantity * unit_price).
--   Net amount after refunds is derived separately from the refunds table.
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- Step 7 – Recreate cart status trigger (refunded branch removed)
-- ---------------------------------------------------------------------------

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

  -- pending → cancelled : remove line items (stock was never deducted)
  ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
    DELETE FROM public.sold_products WHERE cart_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manage_stock_on_cart_status_change
  AFTER UPDATE OF status ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.manage_stock_on_cart_status_change();


-- ---------------------------------------------------------------------------
-- Step 8 – Restock trigger on refund_items INSERT
--   A single trigger replaces the two-step cart + sold_products dance.
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- Step 9 – Indexes and RLS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_refunds_cart_id              ON public.refunds(cart_id);
CREATE INDEX idx_refunds_processed_by         ON public.refunds(processed_by);
CREATE INDEX idx_refund_items_refund_id       ON public.refund_items(refund_id);
CREATE INDEX idx_refund_items_sold_product_id ON public.refund_items(sold_product_id);

ALTER TABLE public.refunds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;

-- refunds: customers see refunds on their own carts; admins see all
CREATE POLICY "refunds_select"
  ON public.refunds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
       WHERE carts.id = refunds.cart_id
         AND (carts.customer_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "refunds_insert"
  ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "refunds_delete"
  ON public.refunds FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- refund_items: access inherited through refund → cart → customer
CREATE POLICY "refund_items_select"
  ON public.refund_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.refunds r
        JOIN public.carts   c ON c.id = r.cart_id
       WHERE r.id = refund_items.refund_id
         AND (c.customer_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "refund_items_insert"
  ON public.refund_items FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "refund_items_delete"
  ON public.refund_items FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));


COMMIT;