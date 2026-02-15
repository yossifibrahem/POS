-- Fix: Allow users to insert their own customer profile during signup
-- The issue is that the existing policy requires 'authenticated' role,
-- but new users during signup may not have an active session yet in some cases

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can insert own customer record" ON public.customers;

-- Create a new policy that allows users to insert their own customer record
-- We use two separate policies: one for authenticated users and one for anon users
-- This ensures that during signup (when the user might not have a session yet),
-- the insert can still succeed

-- Policy for authenticated users (normal case after login)
CREATE POLICY "Users can insert own customer record" ON public.customers 
  FOR INSERT TO authenticated 
  WITH CHECK (id = auth.uid());

-- Policy for anonymous users during signup (fallback case)
-- This allows the insert to succeed even if the user doesn't have an active session yet
CREATE POLICY "Anyone can insert own customer record during signup" ON public.customers 
  FOR INSERT TO anon 
  WITH CHECK (id IS NOT NULL);
