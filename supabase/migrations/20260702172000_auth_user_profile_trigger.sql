-- Create profile/customer rows from Supabase Auth users on sign-up.
-- This keeps registration out of client-side RLS and makes profiles reliable.

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
BEGIN
  profile_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.email), ''),
    'New User'
  );

  profile_email := COALESCE(
    NULLIF(TRIM(NEW.email), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'email'), ''),
    NEW.id::TEXT
  );

  profile_phone := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'phone_number',
    ''
  )), '');

  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id, profile_full_name, profile_email, profile_phone)
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      phone = COALESCE(public.profiles.phone, EXCLUDED.phone);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_create_profile ON auth.users;

CREATE TRIGGER trg_auth_users_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

INSERT INTO public.profiles (id, full_name, email, phone)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(u.email), ''),
    'New User'
  ),
  COALESCE(
    NULLIF(TRIM(u.email), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'email'), ''),
    u.id::TEXT
  ),
  NULLIF(TRIM(COALESCE(
    u.raw_user_meta_data->>'phone',
    u.raw_user_meta_data->>'phone_number',
    ''
  )), '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
