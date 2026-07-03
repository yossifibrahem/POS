DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    id <> auth.uid()
    AND public.is_admin_high(auth.uid())
    AND public.can_access_organization(auth.uid(), organization_id)
  );
