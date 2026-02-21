/**
 * Filter items by a case-insensitive search term
 * @param items - Array of items to filter
 * @param searchTerm - The search term (case-insensitive)
 * @param getter - Function to extract the string to search from each item
 * @returns Filtered array of items
 */
export function filterBySearch<T>(
  items: T[],
  searchTerm: string,
  getter: (item: T) => string | string[]
): T[] {
  if (!searchTerm.trim()) return items;
  
  const term = searchTerm.toLowerCase();
  
  return items.filter((item) => {
    const values = getter(item);
    const valueArray = Array.isArray(values) ? values : [values];
    return valueArray.some((value) => value.toLowerCase().includes(term));
  });
}

/**
 * Filter products by search term and category
 */
export function filterProducts<T extends { name: string; category_id: string | null }>(
  products: T[],
  search: string,
  categoryId: string
): T[] {
  return products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryId !== "all" && p.category_id !== categoryId) return false;
    return true;
  });
}

/**
 * Filter customers by search term (matches name or email from joined profile)
 */
export function filterCustomers<T extends { profiles: { full_name: string; email: string } | null }>(
  customers: T[],
  search: string
): T[] {
  if (!search) return customers;
  const term = search.toLowerCase();
  return customers.filter(
    (c) =>
      c.profiles?.full_name.toLowerCase().includes(term) ||
      c.profiles?.email.toLowerCase().includes(term)
  );
}

export type SortField = "name" | "price" | "stock" | "created_at";
export type SortDirection = "asc" | "desc";

export interface SortOptions {
  field: SortField;
  direction: SortDirection;
}

/**
 * Sort products by specified field and direction
 */
export function sortProducts<T extends { 
  name: string; 
  price: number; 
  stock: number; 
  created_at: string 
}>(
  products: T[],
  sort: SortOptions
): T[] {
  const { field, direction } = sort;
  const multiplier = direction === "asc" ? 1 : -1;

  return [...products].sort((a, b) => {
    let comparison = 0;

    switch (field) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "price":
        comparison = a.price - b.price;
        break;
      case "stock":
        comparison = a.stock - b.stock;
        break;
      case "created_at":
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      default:
        return 0;
    }

    return comparison * multiplier;
  });
}

/**
 * Filter carts by search term across multiple fields:
 * - customer_name
 * - processed_by_name
 * - notes
 * - product names in line_items
 */
export function filterCartsByProduct<T extends { 
  customer_name?: string | null;
  processed_by_name?: string | null;
  notes?: string | null;
  line_items?: { product_name?: string | null }[] | null;
}>(
  carts: T[],
  search: string
): T[] {
  if (!search.trim()) return carts;
  
  const term = search.toLowerCase();
  
  return carts.filter((cart) => {
    const customerName = (cart.customer_name || "").toLowerCase();
    const processedByName = (cart.processed_by_name || "").toLowerCase();
    const notes = (cart.notes || "").toLowerCase();
    
    // Check if any product name in line_items matches
    const productNames = cart.line_items?.map(item => (item.product_name || "").toLowerCase()) || [];
    const hasMatchingProduct = productNames.some(name => name.includes(term));
    
    return (
      customerName.includes(term) ||
      processedByName.includes(term) ||
      notes.includes(term) ||
      hasMatchingProduct
    );
  });
}
