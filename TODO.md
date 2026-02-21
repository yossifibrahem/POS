# Remove Dead Code After Database Migration

## Tasks
- [x] Fix CustomerDetailModal.tsx - remove dead 'refunded' status check
- [x] Review types.ts - already correctly updated for new schema
- [x] Clean up the empty cart.ts file

## Summary of Changes

### 1. CustomerDetailModal.tsx
- Removed dead code checking for `cart.status === 'refunded'` 
- Cart status can only be 'pending', 'completed', or 'cancelled' per migration
- Refund status is now derived from `cart_refund_status` view

### 2. cart.ts
- Deleted empty file that only contained comments about the new refund model

### 3. types.ts
- Already correctly synced with migration - no changes needed
- `sold_products` table properly has no `refunded_quantity` or `status` columns
- `refunds` and `refund_items` tables properly defined
- Views correctly calculate refund data from ledger tables

## Migration Context
Database migration replaced mutating refund pattern with immutable refund ledger:
- Removed `refunded_quantity` and `status` from `sold_products` table
- Removed 'refunded' from `carts.status` CHECK constraint
- Cart status is never set to 'refunded' - refund state is derived from refunds table and views
