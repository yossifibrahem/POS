import { toast } from "sonner";

/**
 * Wrap an async function with loading state management
 */
export async function withLoading<T>(
  setLoading: (loading: boolean) => void,
  fn: () => Promise<T>
): Promise<T | undefined> {
  setLoading(true);
  try {
    const result = await fn();
    return result;
  } catch (error) {
    handleError(error);
    return undefined;
  } finally {
    setLoading(false);
  }
}

/**
 * Handle Supabase errors with consistent toast messages
 */
export function handleError(error: unknown, customMessage?: string): void {
  if (error instanceof Error) {
    if (error.message.includes("violates foreign key")) {
      toast.error("Cannot delete: item has related records");
    } else {
      toast.error(customMessage || error.message);
    }
  } else {
    toast.error(customMessage || "An unexpected error occurred");
  }
}

/**
 * Handle successful operations with toast
 */
export function handleSuccess(message: string): void {
  toast.success(message);
}

/**
 * Validate that a string is not empty after trimming
 */
export function validateRequired(value: string, fieldName: string): boolean {
  if (!value.trim()) {
    toast.error(`${fieldName} is required`);
    return false;
  }
  return true;
}

/**
 * Validate that numeric values are non-negative
 */
export function validateNonNegative(values: number[], fieldNames: string[]): boolean {
  for (let i = 0; i < values.length; i++) {
    if (values[i] < 0) {
      toast.error(`${fieldNames[i]} must be ≥ 0`);
      return false;
    }
  }
  return true;
}
