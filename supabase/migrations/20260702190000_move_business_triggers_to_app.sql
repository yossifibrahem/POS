-- Move POS business side effects from database triggers into application code.
--
-- RLS/auth helper functions, presence RPCs, updated_at triggers, auth profile
-- provisioning, and reporting views remain unchanged.

DROP TRIGGER IF EXISTS trg_manage_stock_on_cart_status_change ON public.carts;
DROP TRIGGER IF EXISTS trg_restock_on_refund_item ON public.refund_items;
DROP TRIGGER IF EXISTS trg_recalculate_cart_total ON public.sold_products;
DROP TRIGGER IF EXISTS trg_clear_product_attributes_on_category_delete ON public.products;

DROP FUNCTION IF EXISTS public.manage_stock_on_cart_status_change();
DROP FUNCTION IF EXISTS public.restock_on_refund_item();
DROP FUNCTION IF EXISTS public.recalculate_cart_total();
DROP FUNCTION IF EXISTS public.clear_product_attributes_on_category_delete();
