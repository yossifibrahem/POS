# Cart & Stock Management Refactor - Implementation Plan

## Summary

The database schema is already updated with `refunded_quantity` column and proper triggers. The frontend code has been updated to use the new refund flow where:
- Partial refund: Update `refunded_quantity = refunded_quantity + :amount`
- Full refund: Update `refunded_quantity = quantity` (status auto-set by DB trigger)

## Files Edited

### 1. ✅ src/integrations/supabase/types.ts
- Added `refunded_quantity` to `sold_products` Row, Insert, and Update types

### 2. ✅ src/components/CartDetailModal.tsx
- Updated `SoldItemRow` type to include `refunded_quantity`
- Fixed `handlePartialReturn` to use `refunded_quantity = refunded_quantity + :amount`
- Updated display to show active/refunded quantities and subtotals
- Added partial refund badge when `refunded_quantity > 0 AND status = 'active'`
- Fixed quantity selector to show only available (non-refunded) quantity
- Added null/undefined handling for backward compatibility

### 3. ✅ src/pages/dashboard/SalesHistory.tsx
- Updated `Cart` interface to include `refunded_quantity` in sold_products
- Fixed `handleRefundCart` to use `refunded_quantity = quantity` for full refunds
- Updated query to fetch `refunded_quantity`
- Updated display to show partial refunds with yellow badge and active/total qty

### 4. ✅ supabase/migrations/add_refunded_quantity.sql (NEW)
- Migration file to add `refunded_quantity` column to database if not exists

## Important: Apply Database Migration

Before the refund functionality will work correctly, apply the migration:
```bash
npx supabase db push
```
Or run the SQL in the migration file manually in Supabase dashboard.

## Build Status
✅ Build successful - all TypeScript compiles correctly

