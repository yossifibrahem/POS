# Fix Empty Space Between Header and Elements

## Problem
Empty transparent space visible between the header and elements below it (search, sort, filter) on all dashboard pages.

## Root Cause
- `space-y-2` on main containers creates gaps between sticky elements
- Sticky elements have `bg-background` but gaps between them are transparent
- DashboardLayout has padding on content wrapper that compounds the issue

## Files to Fix

- [x] src/components/DashboardLayout.tsx - Remove padding from content wrapper
- [x] src/pages/dashboard/Overview.tsx - Remove space-y-2, fix sticky header structure
- [x] src/pages/dashboard/Products.tsx - Remove space-y-2, fix sticky elements structure
- [x] src/pages/dashboard/Categories.tsx - Remove space-y-2, fix sticky elements structure
- [x] src/pages/dashboard/Customers.tsx - Remove space-y-2, fix sticky elements structure
- [x] src/pages/dashboard/NewSale.tsx - Remove space-y-2, fix sticky elements structure
- [x] src/pages/dashboard/SalesHistory.tsx - Remove space-y-2, fix sticky elements structure

## Solution
1. Remove `space-y-2` from all page containers
2. Remove padding from DashboardLayout content div
3. Add `bg-background` to cover any potential gaps
4. Ensure sticky elements are positioned correctly without gaps
