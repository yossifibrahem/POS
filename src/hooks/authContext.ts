import { createContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { AdminLevel } from "@/lib/permissions";

export interface AdminProfile {
  full_name: string;
  email: string;
  organization_id: string;
  organization_name: string;
  branch_id: string | null;
  branch_name: string | null;
}

export interface OrganizationContext {
  id: string;
  name: string;
  contact_email?: string | null;
  phone?: string | null;
  address?: string | null;
  currency_code?: string | null;
}

export interface BranchContext {
  id: string;
  organization_id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
}

export interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  adminLevel: AdminLevel;
  adminProfile: AdminProfile | null;
  organization: OrganizationContext | null;
  branches: BranchContext[];
  activeBranchId: string | null;
  activeBranch: BranchContext | null;
  loading: boolean;
  adminLoading: boolean;
  rememberMe: boolean;
  setRememberMe: (value: boolean) => void;
  setActiveBranchId: (branchId: string | null) => void;
  refreshTenant: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  adminLevel: null,
  adminProfile: null,
  organization: null,
  branches: [],
  activeBranchId: null,
  activeBranch: null,
  loading: true,
  adminLoading: true,
  rememberMe: true,
  setRememberMe: () => {},
  setActiveBranchId: () => {},
  refreshTenant: async () => {},
  signOut: async () => {},
});
