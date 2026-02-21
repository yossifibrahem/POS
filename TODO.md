# Refactor: `profiles` table migration

## Tasks

- [x] 1. Update Supabase Types (`src/integrations/supabase/types.ts`)
  - Add `profiles` table with `Row`, `Insert`, `Update` types
  - Update `customers` table: remove `full_name`, `email`, `phone`, keep only `id`, `created_at`
  - Update `admins` table: remove `full_name`, `updated_at`, keep only `id`, `created_at`
  - Update relationships to reference `profiles`

- [x] 2. Update Register Page (`src/pages/Register.tsx`)
  - Change sign-up handler to insert into `profiles` first, then `customers`

- [x] 3. Update Account Page (`src/pages/Account.tsx`)
  - Change customer query to join with profiles
  - Update `Customer` type to include `profile` property

- [x] 4. Update NewSale Page (`src/pages/dashboard/NewSale.tsx`)
  - Change customers query to join with profiles
  - Update `Customer` interface to include `profile` property
  - Update customer display to use `c.profile.full_name` and `c.profile.email`

- [x] 5. Update Overview Page (`src/pages/dashboard/Overview.tsx`)
  - Customer count query stays the same (just counting rows in `customers` table, which is correct)

- [x] 6. Update Filters (`src/lib/filters.ts`)
  - Update `filterCustomers` generic type to work with nested profile structure
