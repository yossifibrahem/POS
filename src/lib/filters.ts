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
 * Filter customers by search term (matches name or email)
 */
export function filterCustomers<T extends { full_name: string; email: string }>(
  customers: T[],
  search: string
): T[] {
  if (!search) return customers;
  const term = search.toLowerCase();
  return customers.filter(
    (c) =>
      c.full_name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term)
  );
}
