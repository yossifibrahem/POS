import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type TableName = "products" | "carts" | "sold_products" | "categories" | "refunds" | "refund_items" | "profiles" | "admins";
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

export function useRealtime<T = Record<string, unknown>>({
  table,
  schema = "public",
  onChange,
  enabled = true,
}: UseRealtimeOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Keep a stable ref to onChange so it never triggers re-subscription
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!enabled) return;

    // Unique channel name per instance to avoid collisions
    const channelName = `${table}-${schema}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema, table },
        (payload: RealtimePostgresChangesPayload<T>) => {
          onChangeRef.current?.({
            eventType: payload.eventType as ChangeEvent,
            newRecord: payload.new as T,
            oldRecord: payload.old as T,
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // Only re-subscribe if table, schema, or enabled actually changes
  }, [table, schema, enabled]);
}
