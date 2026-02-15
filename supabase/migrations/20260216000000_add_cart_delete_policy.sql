-- Add DELETE policy for carts (admins can delete)
DROP POLICY IF EXISTS "Admins can delete carts" ON public.carts;
CREATE POLICY "Admins can delete carts" ON public.carts
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

