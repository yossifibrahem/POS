-- =============================================================================
-- MIGRATION: Dynamic Category Attributes via JSONB
-- =============================================================================
-- Adds:
--   1. category_attributes  — defines the attribute schema per category
--                             (used by the UI to know what fields to show)
--   2. products.attributes  — JSONB column storing each product's values
--
-- Attribute types supported: text | number | boolean | enum
-- =============================================================================


-- =============================================================================
-- 1. CATEGORY ATTRIBUTES
-- Defines which attributes exist for a category, their type, and (for enums)
-- the list of allowed options stored as a simple JSON array.
-- =============================================================================

CREATE TABLE public.category_attributes (
  id            UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id   UUID                     NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name          TEXT                     NOT NULL,         -- e.g. "ram", "screen_size" (use as JSON key)
  label         TEXT                     NOT NULL,         -- e.g. "RAM", "Screen Size" (display label)
  attribute_type TEXT                    NOT NULL
                                           CHECK (attribute_type IN ('text', 'number', 'boolean', 'enum')),
  unit          TEXT,                                      -- e.g. "GB", "inch" (display only)
  options       JSONB,                                     -- enum options only, e.g. ["4","8","12","16"]
  is_required   BOOLEAN                  NOT NULL DEFAULT false,
  display_order INTEGER                  NOT NULL DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  UNIQUE (category_id, name)
);

CREATE INDEX idx_category_attributes_category_id
  ON public.category_attributes(category_id);

CREATE TRIGGER trg_category_attributes_updated_at
  BEFORE UPDATE ON public.category_attributes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 2. ADD attributes COLUMN TO products
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}';

-- GIN index enables fast filtering on any key inside the JSON blob.
-- e.g. WHERE attributes @> '{"ram": "8"}'
CREATE INDEX idx_products_attributes
  ON public.products USING GIN (attributes);


-- =============================================================================
-- 3. ROW LEVEL SECURITY
-- Mirrors the existing pattern: public read, admin write.
-- =============================================================================

ALTER TABLE public.category_attributes ENABLE ROW LEVEL SECURITY;

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


-- =============================================================================
-- USAGE EXAMPLES
-- =============================================================================

/*

-- ── Setup: define attributes for the "Mobile" category ──────────────────────

INSERT INTO public.category_attributes
  (category_id, name, label, attribute_type, unit, options, is_required, display_order)
VALUES
  ('<mobile-uuid>', 'brand',       'Brand',       'text',    NULL,   NULL,                      true,  1),
  ('<mobile-uuid>', 'screen_size', 'Screen Size', 'number',  'inch', NULL,                      true,  2),
  ('<mobile-uuid>', 'ram',         'RAM',         'enum',    'GB',   '["4","8","12","16"]',     true,  3),
  ('<mobile-uuid>', 'storage',     'Storage',     'enum',    'GB',   '["64","128","256","512"]', true,  4),
  ('<mobile-uuid>', '5g',          '5G',          'boolean', NULL,   NULL,                      false, 5);


-- ── Setup: define attributes for the "Fans" category ────────────────────────

INSERT INTO public.category_attributes
  (category_id, name, label, attribute_type, unit, options, is_required, display_order)
VALUES
  ('<fans-uuid>', 'brand',    'Brand',    'text',   NULL,  NULL,                    true,  1),
  ('<fans-uuid>', 'diameter', 'Diameter', 'number', 'cm',  NULL,                    true,  2),
  ('<fans-uuid>', 'speeds',   'Speeds',   'enum',   NULL,  '["1","2","3","4","5"]', false, 3);


-- ── Insert a product with attributes ────────────────────────────────────────

INSERT INTO public.products (name, price, cost, category_id, stock, attributes)
VALUES (
  'Samsung Galaxy S25',
  999.00,
  650.00,
  '<mobile-uuid>',
  50,
  '{
    "brand":       "Samsung",
    "screen_size": 6.7,
    "ram":         "8",
    "storage":     "256",
    "5g":          true
  }'
);


-- ── Filter: all active phones with 8GB RAM ───────────────────────────────────

SELECT id, name, price, attributes
FROM   public.products
WHERE  category_id = '<mobile-uuid>'
  AND  is_active   = true
  AND  attributes @> '{"ram": "8"}';


-- ── Filter: fans with diameter > 40cm ───────────────────────────────────────

SELECT id, name, price, attributes
FROM   public.products
WHERE  category_id = '<fans-uuid>'
  AND  is_active   = true
  AND  (attributes->>'diameter')::numeric > 40;


-- ── Filter: 5G phones with 256GB storage ────────────────────────────────────

SELECT id, name, price, attributes
FROM   public.products
WHERE  category_id = '<mobile-uuid>'
  AND  is_active   = true
  AND  attributes @> '{"5g": true, "storage": "256"}';


-- ── Fetch schema + options for a category (to build a filter/form UI) ───────

SELECT name, label, attribute_type, unit, options, is_required
FROM   public.category_attributes
WHERE  category_id = '<mobile-uuid>'
ORDER  BY display_order;


-- ── Update a single attribute value on a product ────────────────────────────

UPDATE public.products
SET    attributes = attributes || '{"ram": "16"}'
WHERE  id = '<product-uuid>';

*/
