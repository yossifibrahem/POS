# Admin Level Hierarchy Implementation

## Tasks

### 1. Update Supabase Types
- [x] Add `level` field to `admins` table Row type
- [x] Add `get_admin_level` function type
- [x] Add `is_admin_high` and `is_admin_med_or_above` function types

### 2. Create Permissions Utility
- [x] Create `src/lib/permissions.ts` with helper functions

### 3. Extend useAuth Hook
- [x] Add `adminLevel` to AuthContextType
- [x] Fetch admin level via RPC after confirming admin status
- [x] Expose `adminLevel` from hook

### 4. Update useAdminCheck Hook
- [x] Return both `isAdmin` and `adminLevel`

### 5. Update Sidebar (DashboardLayout)
- [x] Filter nav items based on admin level
- [x] Low admins: only New Sale and Sales History

### 6. Update ProtectedRoute
- [x] Add `requiredLevel` prop
- [x] Implement level-based route protection
- [x] Redirect with toast on insufficient permissions

### 7. Update App.tsx Routes
- [x] Apply `requiredLevel="med"` to protected routes

### 8. Hide Cost and Profit for Med Admins
- [x] Overview.tsx: Remove Profit Today KPI card
- [x] Products.tsx: Hide Cost column and input field
- [x] ProductDetailModal.tsx: Add showCost prop

### 9. Scope Sales History for Low Admins
- [x] Show "Showing your sales only" label
- [x] Hide Refund button for low admins

### 10. Admin Level Management in Profiles
- [x] Show admin level badge
- [x] Add level selector for high admins
- [x] Disable selector for med admins
- [x] Update admin level in database

### 11. Add Code Comments
- [x] Document frontend-only cost suppression
