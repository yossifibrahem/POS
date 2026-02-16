import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

/**
 * Hook to handle sign out with navigation
 * Returns a function that signs out the user and navigates to login
 */
export function useSignOut() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate("/login");
  }, [signOut, navigate]);

  return handleSignOut;
}
