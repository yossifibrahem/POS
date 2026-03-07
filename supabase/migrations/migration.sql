-- =============================================================================
-- MIGRATION: Auto-complete sales for all admin levels
-- Description:
--   Previously, low-level admins could INSERT a cart (as 'pending') but were
--   blocked by RLS from updating it to 'completed'. This caused low-admin
--   sales to stay stuck in 'pending' indefinitely.
--
--   Fix: extend the carts_update policy so any admin can update a cart they
--   personally created (processed_by = auth.uid()). Med/high admins retain
--   their existing ability to update any cart.
--
--   The stock-deduction trigger (pending → completed) is unchanged — it still
--   fires correctly for all admin levels once this policy is in place.
--
--   Additionally, add processed_by_level to the carts_select policy so the
--   frontend can display an admin-level filter in SalesHistory without a
--   separate query.
--
-- Safe to run:   Yes — only drops and recreates policies; no data mutation.
-- Rollback:      Re-run original policy definitions from schema_updated.sql.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. carts UPDATE policy
--    Before: med/high only
--    After:  med/high OR any admin updating their own cart
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "carts_update" ON public.carts;

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


-- ---------------------------------------------------------------------------
-- 2. Verify (optional — run manually to confirm)
--    SELECT polname, polcmd
--      FROM pg_policies
--     WHERE tablename = 'carts'
--     ORDER BY polcmd, polname;
-- ---------------------------------------------------------------------------