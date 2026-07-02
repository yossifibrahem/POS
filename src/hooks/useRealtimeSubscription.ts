import { useCallback } from "react";
import { useRealtime } from "./useRealtime";

/**
 * Type for a callback that handles real-time changes
 */
type ChangeHandler = () => void;

/**
 * Hook to subscribe to cart-related real-time updates.
 * Subscribes to: carts, refunds, refund_items tables
 * 
 * @param onChange - Callback to refresh data when any cart-related change occurs
 * 
 * @example
 * useCartRealtime({
 *   onChange: () => {
 *     fetchDailyData();
 *     fetchSalesHistory();
 *   }
 * });
 */
export function useCartRealtime({ onChange }: { onChange: ChangeHandler }) {
  const handleCartChange = useCallback(() => {
    onChange();
  }, [onChange]);

  // Subscribe to cart changes for real-time updates
  useRealtime({
    table: 'carts',
    onChange: handleCartChange,
    enabled: true,
  });

  // Subscribe to refunds table - triggers refresh when a refund is created
  useRealtime({
    table: 'refunds',
    onChange: handleCartChange,
    enabled: true,
  });

  // Subscribe to refund_items table - triggers refresh when individual items are refunded
  useRealtime({
    table: 'refund_items',
    onChange: handleCartChange,
    enabled: true,
  });
}

/**
 * Hook to subscribe to inventory-related real-time updates.
 * Subscribes to: products, categories tables
 * 
 * @param onChange - Callback to refresh inventory data when changes occur
 * 
 * @example
 * useInventoryRealtime({
 *   onChange: () => {
 *     fetchProducts();
 *     fetchCategories();
 *   }
 * });
 */
export function useInventoryRealtime({ onChange }: { onChange: ChangeHandler }) {
  // Subscribe to products table - triggers refresh when products are added/deleted or stock changes
  useRealtime({
    table: 'products',
    onChange,
    enabled: true,
  });

  // Subscribe to categories table - triggers refresh when categories are added/deleted
  useRealtime({
    table: 'categories',
    onChange,
    enabled: true,
  });
}

/**
 * Hook to subscribe to customer-related real-time updates.
 * Subscribes to: profiles table
 * 
 * @param onChange - Callback to refresh customer data when changes occur
 * 
 * @example
 * useCustomerRealtime({
 *   onChange: fetchCustomers
 * });
 */
export function useCustomerRealtime({ onChange }: { onChange: ChangeHandler }) {
  // Every profile is a customer, so profile changes refresh customer selectors.
  useRealtime({
    table: 'profiles',
    onChange,
    enabled: true,
  });
}

/**
 * Hook to subscribe to product real-time updates with custom handler.
 * Useful when you need to handle product changes in a specific way (e.g., updating local state)
 * 
 * @param onChange - Callback that receives the payload for custom handling
 * 
 * @example
 * useProductRealtime({
 *   onChange: (payload) => {
 *     setProducts(prev => prev.map(p => 
 *       p.id === payload.newRecord.id ? { ...p, ...payload.newRecord } : p
 *     ));
 *   }
 * });
 */
export function useProductRealtime<T = Record<string, unknown>>({ 
  onChange 
}: { 
  onChange: (payload: { eventType: string; newRecord: T; oldRecord: T }) => void 
}) {
  useRealtime({
    table: 'products',
    onChange,
    enabled: true,
  });
}

/**
 * Hook to subscribe to profile-related real-time updates.
 * Subscribes to: profiles and admins tables
 * 
 * @param onChange - Callback to refresh profile data when changes occur
 * 
 * @example
 * useProfileRealtime({
 *   onChange: loadProfiles
 * });
 */
export function useProfileRealtime({ onChange }: { onChange: ChangeHandler }) {
  const handleChange = useCallback(() => {
    onChange();
  }, [onChange]);

  // Subscribe to profiles table - triggers refresh when profiles are created/updated/deleted
  useRealtime({
    table: 'profiles',
    onChange: handleChange,
    enabled: true,
  });

  // Subscribe to admins table - triggers refresh when admin status or levels change
  useRealtime({
    table: 'admins',
    onChange: handleChange,
    enabled: true,
  });
}
