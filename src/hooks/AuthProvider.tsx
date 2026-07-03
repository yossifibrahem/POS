import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AdminLevel } from "@/lib/permissions";
import { AuthContext, type AdminProfile, type BranchContext, type OrganizationContext } from "@/hooks/authContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLevel, setAdminLevel] = useState<AdminLevel>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [organization, setOrganization] = useState<OrganizationContext | null>(null);
  const [branches, setBranches] = useState<BranchContext[]>([]);
  const [activeBranchIdState, setActiveBranchIdState] = useState<string | null>(null);
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

  const setActiveBranchId = useCallback((branchId: string | null) => {
    const userId = currentUserId.current;
    if (userId) {
      const storageKey = `activeBranch:${userId}`;
      if (branchId) localStorage.setItem(storageKey, branchId);
      else localStorage.removeItem(storageKey);
    }
    setActiveBranchIdState(branchId);
  }, []);

  const checkAdmin = useCallback(async (userId: string) => {
    const { data: isAdminCheck } = await supabase.rpc("is_admin", { _user_id: userId });
    const isUserAdmin = !!isAdminCheck;
    setIsAdmin(isUserAdmin);

    if (!isUserAdmin) {
      setAdminLevel(null);
      setAdminProfile(null);
      setOrganization(null);
      setBranches([]);
      setActiveBranchIdState(null);
      return;
    }

    const { data: adminData } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!adminData) {
      setAdminLevel(null);
      setAdminProfile(null);
      setOrganization(null);
      setBranches([]);
      setActiveBranchIdState(null);
      return;
    }

    const level = (adminData.level as AdminLevel) || null;
    setAdminLevel(level);
    setAdminProfile({
      full_name: adminData.full_name || "",
      email: adminData.email || "",
      organization_id: adminData.organization_id,
      organization_name: adminData.organization_name || "",
      branch_id: adminData.branch_id,
      branch_name: adminData.branch_name,
    });

    const { data: organizationData } = await supabase
      .from("organizations")
      .select("id, name, contact_email, phone, address, currency_code")
      .eq("id", adminData.organization_id)
      .single();

    setOrganization(organizationData || {
      id: adminData.organization_id,
      name: adminData.organization_name || "Organization",
    });

    let branchQuery = supabase
      .from("branches")
      .select("id, organization_id, name, address, phone, is_active")
      .eq("organization_id", adminData.organization_id)
      .order("name");

    if (level !== "high" && adminData.branch_id) {
      branchQuery = branchQuery.eq("id", adminData.branch_id);
    }

    const { data: branchData } = await branchQuery;
    const availableBranches = (branchData || []) as BranchContext[];
    setBranches(availableBranches);

    const savedBranchId = localStorage.getItem(`activeBranch:${userId}`);
    const savedBranch = availableBranches.find((branch) => branch.id === savedBranchId && branch.is_active);
    const assignedBranch = availableBranches.find((branch) => branch.id === adminData.branch_id && branch.is_active);
    const firstActiveBranch = availableBranches.find((branch) => branch.is_active);
    const nextActiveBranchId = savedBranch?.id || assignedBranch?.id || firstActiveBranch?.id || null;

    setActiveBranchIdState(nextActiveBranchId);
    if (nextActiveBranchId) localStorage.setItem(`activeBranch:${userId}`, nextActiveBranchId);
  }, []);

  const refreshTenant = useCallback(async () => {
    const userId = currentUserId.current;
    if (!userId) return;
    await checkAdmin(userId);
  }, [checkAdmin]);

  const updateSessionUser = useCallback((nextUser: User | null) => {
    currentUserId.current = nextUser?.id ?? null;
    setUser(nextUser);
    setLoading(false);

    if (!nextUser) {
      setIsAdmin(false);
      setAdminLevel(null);
      setAdminProfile(null);
      setOrganization(null);
      setBranches([]);
      setActiveBranchIdState(null);
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
    setOrganization(null);
    setBranches([]);
    setActiveBranchIdState(null);
  };

  const activeBranch = branches.find((branch) => branch.id === activeBranchIdState) || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        adminLevel,
        adminProfile,
        organization,
        branches,
        activeBranchId: activeBranchIdState,
        activeBranch,
        loading,
        adminLoading,
        rememberMe,
        setRememberMe,
        setActiveBranchId,
        refreshTenant,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
