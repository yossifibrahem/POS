# Schema Refactoring: Hierarchical to Parallel Structure

## Goal
Change from `auth.users` → `customers` → `admins` to parallel structure:
- `auth.users` → `customers`
- `auth.users` → `admins`

## Tasks

- [x] 1. Update SQL schema (`supabase/migrations/schema_updated.sql`)
  - [x] Change admins table to reference auth.users directly
  - [x] Update is_admin function (no change needed - already checks admins.id = _user_id)
  - [x] Update carts.processed_by foreign key (no change needed - still references admins.id)

- [x] 2. Update TypeScript types (`src/integrations/supabase/types.ts`)
  - [x] Update admins Relationships to reference users
  - [x] Verify carts Relationships are correct (no change needed)

- [x] 3. Verify application code compatibility
  - [x] Check useAuth.tsx (uses is_admin RPC - compatible)
  - [x] Check useAdminCheck.ts (uses is_admin RPC - compatible)
  - [x] Check Customers.tsx (requires update - see below)

## Required Changes in Customers.tsx

The `Customers.tsx` page needs to be updated because:

**Current Logic:**
- Loads all customers from `customers` table
- Checks if each customer is an admin by looking up `admins.id` (which was previously `customers.id`)
- Promotes by inserting into `admins` with `id: promoteTarget.id` (customer's id)
- Demotes by deleting from `admins` where `id: demoteTarget.id` (customer's id)

**Problem with New Schema:**
- In the new parallel structure, `admins.id` references `auth.users.id`, not `customers.id`
- A user can be an admin without being a customer
- The current UI assumes all admins are customers, which may not be true

**Options:**
1. **Keep current behavior**: Only show customers who are also admins (admins who are not customers won't appear)
2. **Show all users**: Create a new view that shows all auth.users with their roles
3. **Hybrid approach**: Show customers + admins separately

**Recommended Change:**
Update the `load` function to fetch admins separately and match by `auth.users.id`. Since `customers.id` and `admins.id` both reference `auth.users.id`, they can be matched:

```typescript
const load = async () => {
  await withLoading(setLoading, async () => {
    const { data: custs } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    const { data: admins } = await supabase.from("admins").select("id");
    const { data: carts } = await supabase.from("carts").select("customer_id");
    const adminIds = new Set((admins || []).map((a) => a.id));
    const cartCounts: Record<string, number> = {};
    (carts || []).forEach((c) => { cartCounts[c.customer_id] = (cartCounts[c.customer_id] || 0) + 1; });
    // Both customers.id and admins.id reference auth.users.id, so they can be matched
    setCustomers((custs || []).map((c) => ({ ...c, is_admin: adminIds.has(c.id), cart_count: cartCounts[c.id] || 0 })));
  });
};
```

The current code will still work because:
- `customers.id` references `auth.users.id`
- `admins.id` references `auth.users.id`
- Both use the same UUID from `auth.users`, so `adminIds.has(c.id)` will correctly match

**No changes needed to Customers.tsx** - the existing logic works with the new parallel structure because both tables use the same `auth.users.id` as their primary key.
