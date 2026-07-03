import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AdminLevel } from "@/lib/permissions";
import { AuthContext, type AdminProfile } from "@/hooks/authContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLevel, setAdminLevel] = useState<AdminLevel>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
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

  const checkAdmin = useCallback(async (userId: string) => {
    const { data: isAdminCheck } = await supabase.rpc("is_admin", { _user_id: userId });
    const isUserAdmin = !!isAdminCheck;
    setIsAdmin(isUserAdmin);

    if (!isUserAdmin) {
      setAdminLevel(null);
      setAdminProfile(null);
      return;
    }

    const { data: levelData } = await supabase.rpc("get_admin_level", { _user_id: userId });
    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    setAdminLevel((levelData as AdminLevel) || null);
    if (profileData) setAdminProfile(profileData);
  }, []);

  const updateSessionUser = useCallback((nextUser: User | null) => {
    currentUserId.current = nextUser?.id ?? null;
    setUser(nextUser);
    setLoading(false);

    if (!nextUser) {
      setIsAdmin(false);
      setAdminLevel(null);
      setAdminProfile(null);
      setAdminLoading(false);
      return;
    }

    setAdminLoading(true);
    checkAdmin(nextUser.id).finally(() => setAdminLoading(false));
  }, [checkAdmin]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      if ((nextUser?.id ?? null) !== currentUserId.current) updateSessionUser(nextUser);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      updateSessionUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [updateSessionUser]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setAdminLevel(null);
    setAdminProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, adminLevel, adminProfile, loading, adminLoading, rememberMe, setRememberMe, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
