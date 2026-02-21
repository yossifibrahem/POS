import { SortOptions } from "@/lib/filters";

/**
 * Parse sort parameters from URL search params
 * @param searchParams - URLSearchParams from react-router
 * @returns SortOptions object with field and direction
 */
export function parseSortFromURL(searchParams: URLSearchParams): SortOptions {
  const sortParam = searchParams.get('sort');
  if (sortParam) {
    const [field, direction] = sortParam.split('-') as [SortOptions["field"], SortOptions["direction"]];
    // Validate the sort option
    const validFields = ['name', 'price', 'stock', 'created_at'];
    const validDirections = ['asc', 'desc'];
    if (validFields.includes(field) && validDirections.includes(direction)) {
      return { field, direction };
    }
  }
  return { field: "created_at", direction: "desc" };
}

/**
 * Build sort URL parameter string
 * @param sort - SortOptions object
 * @returns URL parameter string (e.g., "stock-asc")
 */
export function buildSortParam(sort: SortOptions): string {
  return `${sort.field}-${sort.direction}`;
}

/**
 * Valid sort configurations for UI dropdowns
 */
export const SORT_OPTIONS = [
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "price-asc", label: "Price (Low-High)" },
  { value: "price-desc", label: "Price (High-Low)" },
  { value: "stock-asc", label: "Stock (Low-High)" },
  { value: "stock-desc", label: "Stock (High-Low)" },
  { value: "created_at-desc", label: "Newest First" },
  { value: "created_at-asc", label: "Oldest First" },
] as const;
