import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to check admin status and navigate to appropriate page
 */
export function useAdminCheck() {
  const navigate = useNavigate();

  const checkAdminAndNavigate = useCallback(async (userId: string) => {
    try {
      const { data: adminCheck } = await supabase.rpc("is_admin", { _user_id: userId });
      if (adminCheck) {
        navigate("/dashboard");
      } else {
        navigate("/login");
      }
    } catch (e) {
      // If admin check fails, default to login page
      navigate("/login");
    }
  }, [navigate]);

  return checkAdminAndNavigate;
}
