-- Allow admins to update and delete sold_products (for returns)
CREATE POLICY "Admins can update sold products" ON public.sold_products
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete sold products" ON public.sold_products
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
