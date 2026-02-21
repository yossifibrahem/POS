import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

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
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(true);
  const currentUserId = useRef<string | null>(null);
  const [rememberMe, setRememberMeState] = useState(() => {
    const saved = localStorage.getItem("rememberMe");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const setRememberMe = (value: boolean) => {
    localStorage.setItem("rememberMe", JSON.stringify(value));
    setRememberMeState(value);
  };

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase.rpc("is_admin", { _user_id: userId });
    setIsAdmin(!!data);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        const newUserId = u?.id ?? null;
        
        // Only update state if user actually changed (prevents remount on tab focus)
        if (newUserId !== currentUserId.current) {
          currentUserId.current = newUserId;
          setUser(u);
          setLoading(false);
          if (u) {
            setAdminLoading(true);
            checkAdmin(u.id).finally(() => setAdminLoading(false));
          } else {
            setIsAdmin(false);
            setAdminLoading(false);
          }
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      currentUserId.current = u?.id ?? null;
      setUser(u);
      setLoading(false);
      if (u) {
        setAdminLoading(true);
        checkAdmin(u.id).finally(() => setAdminLoading(false));
      } else {
        setAdminLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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
