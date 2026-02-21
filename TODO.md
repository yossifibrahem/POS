# State Persistence Fix - TODO

## Problem
Opening a new tab or refreshing the page causes the React app to "restart" - all state is lost and auth check causes loading flash.

## Root Causes
1. React state (useState) is ephemeral - lost on page refresh
2. AuthProvider shows loading spinner while checking session
3. No UI state persistence for cart, filters, forms
4. ProtectedRoute redirects before auth state is confirmed

## Implementation Plan

- [x] Create `usePersistentState` hook for localStorage/sessionStorage persistence
- [x] Update `useAuth.tsx` to cache auth state and reduce loading flash
- [x] Update `ProtectedRoute.tsx` to use cached auth state for smoother transitions
- [x] Test persistence across tab refreshes and new tabs
- [x] Apply persistent state to critical UI state (cart, filters, forms)

## Files Modified
1. `src/hooks/usePersistentState.ts` - NEW FILE ✓
2. `src/hooks/useAuth.tsx` - UPDATE ✓
3. `src/components/ProtectedRoute.tsx` - UPDATE ✓
4. `src/pages/dashboard/NewSale.tsx` - Cart, search, filter, sort, customer, notes persistence ✓
5. `src/pages/dashboard/Products.tsx` - Search, filter, sort persistence ✓
6. `src/pages/dashboard/Categories.tsx` - Search persistence ✓
7. `src/pages/dashboard/Customers.tsx` - Search persistence ✓
8. `src/pages/dashboard/SalesHistory.tsx` - Search, date range, hide refunded persistence ✓
