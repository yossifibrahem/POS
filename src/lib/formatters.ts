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

/**
 * Format a date to relative time (e.g., "2 hours ago", "Just now")
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return formatDateTime(date);
}
