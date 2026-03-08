import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const PING_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Hook to manage admin presence/activity tracking.
 * 
 * - Pings the database on mount
 * - Pings every 60 seconds as a heartbeat
 * - Pings when the tab regains focus (visibilitychange)
 * - Only active for authenticated admins
 * 
 * Returns lastPingedAt timestamp to be used as a dependency
 * for re-fetching online admins in other components.
 */
export function useAdminPresence() {
  const { isAdmin, user } = useAuth();
  const [lastPingedAt, setLastPingedAt] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const ping = useCallback(async () => {
    if (!isAdmin || !user) return;

    try {
      const { data, error } = await supabase.rpc("ping_admin_presence");
      
      if (error) {
        console.warn("Failed to ping admin presence:", error.message);
        return;
      }

      // data contains the server timestamp of the ping
      if (mountedRef.current && data) {
        setLastPingedAt(data);
      }
    } catch (err) {
      console.warn("Error pinging admin presence:", err);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    mountedRef.current = true;

    // Early return if not an admin
    if (!isAdmin) {
      return;
    }

    // Immediate ping on mount
    ping();

    // Set up interval for heartbeat (every 60 seconds)
    intervalRef.current = setInterval(ping, PING_INTERVAL_MS);

    // Handle visibility change (tab regains focus)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        ping();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAdmin, ping]);

  return { lastPingedAt };
}

