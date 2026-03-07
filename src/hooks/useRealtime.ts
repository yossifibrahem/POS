import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type TableName = "products" | "carts" | "sold_products" | "categories" | "customers" | "refunds" | "refund_items" | "profiles" | "admins";

export type ChangeEvent = "INSERT" | "UPDATE" | "DELETE";

export interface RealtimePayload<T = Record<string, unknown>> {
  eventType: ChangeEvent;
  newRecord: T;
  oldRecord: T;
}

interface UseRealtimeOptions<T = Record<string, unknown>> {
  table: TableName;
  schema?: string;
  onChange?: (payload: RealtimePayload<T>) => void;
  enabled?: boolean;
}

/**
 * Hook to subscribe to Supabase Realtime changes for a specific table.
 * 
 * @param table - The table name to subscribe to
 * @param schema - The database schema (defaults to 'public')
 * @param onChange - Callback when changes occur
 * @param enabled - Whether to enable the subscription
 * 
 * @example
 * useRealtime({
 *   table: 'products',
 *   onChange: (payload) => {
 *     if (payload.eventType === 'UPDATE') {
 *       // Update local products state
 *     }
 *   }
 * });
 */
export function useRealtime<T = Record<string, unknown>>({
  table,
  schema = "public",
  onChange,
  enabled = true,
}: UseRealtimeOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  const subscribe = useCallback(() => {
    if (!enabled || !onChange) return;

    // Unsubscribe from existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`${table}-realtime`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema,
          table,
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          onChange({
            eventType: payload.eventType as ChangeEvent,
            newRecord: payload.new as T,
            oldRecord: payload.old as T,
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, schema, onChange, enabled]);

  useEffect(() => {
    const cleanup = subscribe();
    return () => {
      if (cleanup) cleanup();
    };
  }, [subscribe]);

  return {
    /** Force re-subscribe (useful after a reconnect) */
    resubscribe: subscribe,
  };
}

