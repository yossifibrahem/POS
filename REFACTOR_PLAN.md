# Plan: Cart & Stock Management Refactor

## Information Gathered

### Current Database Schema Issues
1. `sold_products` table is **missing** `refunded_quantity` column
2. Current `status` column is used for full-line refunds, but per new spec:
   - `refunded_quantity` should track partial refunds
   - `status` should be auto-managed by DB (active/refunded)
3. Trigger B (`restock_on_sold_product_refund`) currently fires on `status` change, but should fire on `refunded_quantity` change

### Files Analyzed
1. **supabase/migrations/schema_updated.sql** - Database schema and triggers
2. **src/integrations/supabase/types.ts** - TypeScript types
3. **src/components/CartDetailModal.tsx** - Cart detail modal with return functionality
4. **src/pages/dashboard/SalesHistory.tsx** - Sales history with refund functionality
5. **src/pages/dashboard/NewSale.tsx** - Already follows correct flow (pending → insert → complete)

---

## Plan

### Step 1: Update Database Schema (schema_updated.sql)
- Add `refunded_quantity INTEGER NOT NULL DEFAULT 0` column to `sold_products` table
- Add CHECK constraint: `refunded_quantity >= 0`
- Add CHECK constraint: `refunded_quantity <= quantity`
- Modify Trigger B to:
  - Fire on `refunded_quantity` UPDATE (instead of status)
  - Restock the delta: `NEW.refunded_quantity - OLD.refunded_quantity`
  - Auto-set `status = 'refunded'` when `refunded_quantity = quantity`
- Update Trigger A comment to reflect new behavior

### Step 2: Update TypeScript Types (types.ts)
- Add `refunded_quantity` to `sold_products` Row, Insert, and Update types

### Step 3: Refactor CartDetailModal.tsx
- Update types to include `refunded_quantity`
- Modify `handlePartialReturn` to:
  - Update `refunded_quantity = refunded_quantity + :amount` (instead of status)
  - Remove manual status update - DB trigger handles it
- Update display to show:
  - `active_quantity = quantity - refunded_quantity`
  - `active_subtotal = active_quantity * unit_price`
  - `refunded_subtotal = refunded_quantity * unit_price`
- Show partial refund badge when `refunded_quantity > 0 AND status = 'active'`

### Step 4: Refactor SalesHistory.tsx
- Update full cart refund to:
  1. Mark cart as 'refunded' (status)
  2. Set all active sold_products: `refunded_quantity = quantity` (DB trigger restocks and sets status)

---

## Dependent Files to be Edited

1. **supabase/migrations/schema_updated.sql** - Database changes
2. **src/integrations/supabase/types.ts** - TypeScript types
3. **src/components/CartDetailModal.tsx** - Return/partial refund logic
4. **src/pages/dashboard/SalesHistory.tsx** - Full cart refund logic

---

## Followup Steps

1. Apply database migration to update schema
2. Run TypeScript build to verify types compile
3. Test partial refund flow in UI
4. Test full cart refund flow in UI
5. Verify stock is correctly deducted/restored

