import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCachedAuthState } from "@/hooks/usePersistentState";

export function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isAdmin, loading, adminLoading } = useAuth();
  const { cachedUser, isCacheValid, isHydrated } = useCachedAuthState();

  // Use cached auth state to reduce loading flash
  // If we have a valid cache, we can optimistically show the UI while verifying
  const hasValidCache = isHydrated && cachedUser && isCacheValid();
  const isActuallyLoading = loading && !hasValidCache;
  const isAdminActuallyLoading = adminLoading && !hasValidCache;

  if (isActuallyLoading || (adminOnly && isAdminActuallyLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If loading is done and no user, redirect to login
  // Or if we have no valid cache and no user, redirect
  if (!loading && !user) return <Navigate to="/login" replace />;
  
  // If we're still loading but have valid cache, don't redirect yet
  // Let the auth check complete first
  if (loading && !hasValidCache && !user) return <Navigate to="/login" replace />;
  
  if (!loading && adminOnly && !isAdmin) return <Navigate to="/account" replace />;

  return <>{children}</>;
}
