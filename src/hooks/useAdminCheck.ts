import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { AdminLevel } from "@/lib/permissions";

interface AdminCheckResult {
  isAdmin: boolean;
  adminLevel: AdminLevel;
}

/**
 * Hook to check admin status and navigate to appropriate page
 * Returns both isAdmin status and adminLevel for permission checks
 */
export function useAdminCheck() {
  const navigate = useNavigate();

  const checkAdminAndNavigate = useCallback(async (userId: string): Promise<AdminCheckResult> => {
    try {
      const { data: adminCheck, error: adminError } = await supabase.rpc("is_admin", { _user_id: userId });
      if (adminError) throw adminError;

      const isUserAdmin = !!adminCheck;
      
      let level: AdminLevel = null;
      if (isUserAdmin) {
        const { data: levelData, error: levelError } = await supabase.rpc("get_admin_level", { _user_id: userId });
        if (levelError) throw levelError;

        level = (levelData as AdminLevel) || null;
        navigate("/dashboard");
      } else {
        navigate("/purchase-history");
      }
      
      return { isAdmin: isUserAdmin, adminLevel: level };
    } catch (e) {
      // If admin check fails, default to login page
      navigate("/login");
      return { isAdmin: false, adminLevel: null };
    }
  }, [navigate]);

  return checkAdminAndNavigate;
}
