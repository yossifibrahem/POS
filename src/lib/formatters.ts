/**
 * Format a number as currency (USD)
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format a date to locale date string
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString();
}

/**
 * Format a date to locale date and time string
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString();
}

/**
 * Format a number with commas for thousands
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Get the start and end of today in local timezone as ISO strings
 * This ensures sales made at any local time are included in "today's" results
 */
export function getLocalDateRange(): { start: string; end: string } {
  const now = new Date();
  
  // Start of today in local time
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // End of today in local time (23:59:59.999)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
