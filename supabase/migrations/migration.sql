-- =============================================================================
-- MIGRATION: v4 → v5  —  Admin Presence Tracking
-- =============================================================================
--
-- What this migration adds
-- ────────────────────────
--   • admins.last_seen_at   — timestamp of the admin's most recent activity ping.
--                             NULL means the admin has never been seen since this
--                             migration ran (treated as "offline" by all helpers).
--
--   • is_online computed logic (not a stored column) — defined as:
--         last_seen_at > now() - interval '5 minutes'
--     This threshold is applied consistently in the view and helper functions
--     so it only needs to change in one place (get_online_admins / admin_profiles).
--
--   • ping_admin_presence()    — SECURITY DEFINER RPC called by the frontend on
--                                every meaningful user action (page load, sale,
--                                heartbeat every ~60 s). Updates the caller's own
--                                last_seen_at without relaxing the existing high-
--                                admin-only UPDATE policy on the admins table.
--
--   • get_online_admins()      — returns every admin whose last_seen_at falls
--                                within the active window. Useful for dashboards.
--
--   • admin_profiles view      — rebuilt to include last_seen_at + is_online.
--
--   • idx_admins_last_seen_at  — BRIN index for fast range scans on the timestamp.
--
-- How to apply
-- ────────────
--   Run this file once against your existing v4 database.
--   It is idempotent for the column (IF NOT EXISTS guard) and uses
--   CREATE OR REPLACE for functions and views, so it is safe to re-run.
--
-- Frontend integration (pseudo-code)
-- ────────────────────────────────────
--   // On app load and on each significant action:
--   await supabase.rpc('ping_admin_presence');
--
--   // Periodic heartbeat (keeps the session "alive"):
--   setInterval(() => supabase.rpc('ping_admin_presence'), 60_000);
--
--   // Read presence in the Admins Management UI:
--   const { data } = await supabase.from('admin_profiles').select('*');
--   // Each row now has: last_seen_at (timestamptz | null), is_online (bool)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add last_seen_at to admins
--    NULL is intentional for admins who have never pinged (legacy rows).
-- ---------------------------------------------------------------------------
ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN public.admins.last_seen_at IS
  'Timestamp of the most recent activity ping from this admin. '
  'NULL = never seen. Used to compute is_online (within 5-minute window).';


-- ---------------------------------------------------------------------------
-- 2. Index — BRIN is cheap and effective for append-like timestamp columns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_admins_last_seen_at
  ON public.admins USING BRIN (last_seen_at);


-- ---------------------------------------------------------------------------
-- 3. ping_admin_presence()
--    Called by the authenticated admin to record their current presence.
--    SECURITY DEFINER bypasses the high-admin-only UPDATE RLS policy so
--    any admin level can update their own row without relaxing that policy.
--    Returns the updated timestamp for the caller to confirm the write.
-- ---------------------------------------------------------------------------
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

  -- If the caller is not in the admins table at all, the UPDATE is a no-op.
  -- Return the timestamp regardless so the frontend can use it as a clock sync.
  RETURN v_now;
END;
$$;

COMMENT ON FUNCTION public.ping_admin_presence() IS
  'Updates last_seen_at for the calling admin to now(). '
  'Call on page load, on each sale/refund action, and every ~60 s as a heartbeat. '
  'Returns the server timestamp of the ping.';


-- ---------------------------------------------------------------------------
-- 4. get_online_admins()
--    Returns id + full_name + level + last_seen_at for every admin whose
--    last_seen_at is within the 5-minute active window.
--    Restricted to admins (is_admin check) via SECURITY DEFINER + explicit guard.
-- ---------------------------------------------------------------------------
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
     AND public.is_admin(auth.uid())   -- only admins may call this function
   ORDER BY a.last_seen_at DESC;
$$;

COMMENT ON FUNCTION public.get_online_admins() IS
  'Returns all admins active within the last 5 minutes. '
  'Callable by any admin level; non-admins get an empty result set.';


-- ---------------------------------------------------------------------------
-- 5. Rebuild admin_profiles view
--    Adds last_seen_at and is_online to the existing columns.
--    DROP + CREATE is used because Postgres does not support adding columns
--    to a view with CREATE OR REPLACE when the column list changes position
--    (safe here as this is a read-only convenience view with no dependents).
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.admin_profiles;

CREATE VIEW public.admin_profiles AS
SELECT a.id,
       a.level,
       a.created_at                                          AS admin_since,
       a.last_seen_at,
       (a.last_seen_at > now() - INTERVAL '5 minutes')      AS is_online,
       p.full_name,
       p.email,
       p.phone
  FROM public.admins   a
  JOIN public.profiles p ON p.id = a.id;

COMMENT ON VIEW public.admin_profiles IS
  'Joins admins with their profile data. '
  'is_online = TRUE when last_seen_at is within the last 5 minutes. '
  'last_seen_at = NULL means the admin has never pinged since v5 migration.';


-- =============================================================================
-- END OF MIGRATION v4 → v5
-- =============================================================================