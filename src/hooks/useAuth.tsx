import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useCachedAuthState } from "./usePersistentState";

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  adminLoading: boolean;
  rememberMe: boolean;
  setRememberMe: (value: boolean) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  adminLoading: true,
  rememberMe: true,
  setRememberMe: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { cachedUser, updateCachedUser, isCacheValid, isHydrated } = useCachedAuthState();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Start with loading true, but will check cache immediately
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(true);
  const [rememberMe, setRememberMeState] = useState(() => {
    const saved = localStorage.getItem("rememberMe");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const setRememberMe = (value: boolean) => {
    localStorage.setItem("rememberMe", JSON.stringify(value));
    setRememberMeState(value);
  };

  const checkAdmin = useCallback(async (userId: string) => {
    const { data } = await supabase.rpc("is_admin", { _user_id: userId });
    setIsAdmin(!!data);
  }, []);

  // Check cache immediately on mount to reduce loading flash
  useEffect(() => {
    if (isHydrated && cachedUser && isCacheValid()) {
      // We have a valid cache, but still need to verify with server
      // Don't set loading to false yet, but we could optimistically show UI
    }
  }, [isHydrated, cachedUser, isCacheValid]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        // Update cache when auth state changes
        if (u) {
          updateCachedUser({ id: u.id, email: u.email });
        } else {
          updateCachedUser(null);
        }
        setLoading(false);
        if (u) {
          setAdminLoading(true);
          checkAdmin(u.id).finally(() => setAdminLoading(false));
        } else {
          setIsAdmin(false);
          setAdminLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      // Update cache when session is retrieved
      if (u) {
        updateCachedUser({ id: u.id, email: u.email });
      } else {
        updateCachedUser(null);
      }
      setLoading(false);
      if (u) {
        setAdminLoading(true);
        checkAdmin(u.id).finally(() => setAdminLoading(false));
      } else {
        setAdminLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAdmin, updateCachedUser]);

  const signOut = async () => {
    await supabase.auth.signOut();
    updateCachedUser(null);
    setUser(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, adminLoading, rememberMe, setRememberMe, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
