# Category Attributes Implementation - TODO

## Phase 1: Type Definitions
- [x] Update `src/integrations/supabase/types.ts`
  - Add CategoryAttribute interface
  - Add attributes field to Product interface

## Phase 2: Categories Page
- [x] Update `src/pages/dashboard/Categories.tsx`
  - Add CategoryAttribute interface
  - Add state for attributes management
  - Create attribute management modal
  - Add CRUD operations for category_attributes table
  - Add "Manage Attributes" button to category cards

## Phase 3: Products Page
- [x] Update `src/pages/dashboard/Products.tsx`
  - Add state for category attributes
  - Fetch attributes when category selected
  - Create dynamic form fields based on attribute type
  - Handle attributes in save operation
  - Load existing attributes when editing

## Phase 4: ProductDetailModal
- [x] Update `src/components/ProductDetailModal.tsx`
  - Add state for category attributes
  - Fetch and display attributes section
  - Format values based on type (boolean, number with units)

## Phase 5: NewSale Page
- [x] Update `src/pages/dashboard/NewSale.tsx`
  - Show key attributes in product cards
  - Display attributes in product detail view

## Testing Checklist
- [x] Can create/edit/delete category attributes
- [x] Required attributes are enforced
- [x] Enum types show dropdown with correct options
- [x] Number types accept numeric input only
- [x] Boolean types show as checkbox/toggle
- [x] Attributes save correctly to products.attributes JSONB
- [x] Attributes display properly in product details
- [x] Can update attribute values on existing products
- [x] Changing category on product updates attribute fields
