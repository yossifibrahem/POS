import { createContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { AdminLevel } from "@/lib/permissions";

export interface AdminProfile {
  full_name: string;
  email: string;
}

export interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  adminLevel: AdminLevel;
  adminProfile: AdminProfile | null;
  loading: boolean;
  adminLoading: boolean;
  rememberMe: boolean;
  setRememberMe: (value: boolean) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  adminLevel: null,
  adminProfile: null,
  loading: true,
  adminLoading: true,
  rememberMe: true,
  setRememberMe: () => {},
  signOut: async () => {},
});
