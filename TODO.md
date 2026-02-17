# Categories.tsx Cleanup TODO

## Tasks
- [x] Create shared types file `src/types/category.ts`
- [x] Create shared utilities file `src/lib/attributes.ts`
- [x] Update `Categories.tsx` - remove dead code and use shared utilities
- [x] Update `Products.tsx` - use shared types
- [x] Verify no TypeScript errors

## Summary of Changes

### Dead Code Removed
- Removed duplicate type definitions (`AttributeType`, `CategoryAttribute`, `Category` interfaces)
- Removed duplicate `parseOptions` helper function
- Removed duplicate `getAttributeTypeBadge` function

### Code Deduplication
- Created `src/types/category.ts` with shared types:
  - `AttributeType` type
  - `CategoryAttribute` interface
  - `Category` interface
- Created `src/lib/attributes.ts` with shared utilities:
  - `parseOptions()` - safely parses Json options to string array
  - `getAttributeTypeBadgeClass()` - returns CSS class for attribute type badges

### Files Updated
- `Categories.tsx` - now imports from shared modules
- `Products.tsx` - now imports `CategoryAttribute` and `AttributeType` from shared types, uses `parseOptions` for enum options

### Verification
- TypeScript check passed with no errors
