import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { AdminLevel } from "@/lib/permissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  requiredLevel?: 'high' | 'med';
}

function hasRequiredLevel(level: AdminLevel, required: 'high' | 'med'): boolean {
  if (required === 'high') return level === 'high';
  if (required === 'med') return level === 'high' || level === 'med';
  return false;
}

export function ProtectedRoute({ children, adminOnly = false, requiredLevel }: ProtectedRouteProps) {
  const { user, isAdmin, adminLevel, loading, adminLoading } = useAuth();

  if (loading || adminLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  // Check level-based permissions
  if (requiredLevel && !hasRequiredLevel(adminLevel, requiredLevel)) {
    toast.error("You don't have permission to access this page.");
    return <Navigate to="/dashboard/sales" replace />;
  }

  return <>{children}</>;
}
