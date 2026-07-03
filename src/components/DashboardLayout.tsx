import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSignOut } from "@/hooks/useSignOut";
import { useAuth } from "@/hooks/useAuth";
import { useAdminPresence } from "@/hooks/useAdminPresence";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";
import { LayoutDashboard, Package, Tags, ShoppingCart, History, Users, LogOut, User } from "lucide-react";
import { canAccessDashboard, canAccessOwnOverview } from "@/lib/permissions";
import { useEffect, useRef, useState, useCallback } from "react";

const SWIPE_THRESHOLD = 50;    // min horizontal distance (px) to trigger
const SWIPE_MAX_VERTICAL = 80; // max vertical drift allowed (px)

const allNavItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Products", url: "/dashboard/products", icon: Package },
  { title: "Categories", url: "/dashboard/categories", icon: Tags },
  { title: "New Sale", url: "/dashboard/sales", icon: ShoppingCart },
  { title: "Sales History", url: "/dashboard/sales/history", icon: History },
  { title: "Profiles", url: "/dashboard/profiles", icon: Users },
];

function DashboardContent() {
  const { adminLevel, adminProfile } = useAuth();
  const handleSignOut = useSignOut();
  const location = useLocation();
  const [pageTitle, setPageTitle] = useState("Overview");

  // Ping admin presence on mount, every 60s, and on tab focus
  useAdminPresence();

  // isMobile + setOpenMobile are the correct hooks for mobile sidebar state
  const { isMobile, setOpen, setOpenMobile } = useSidebar();

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const navItems = canAccessDashboard(adminLevel)
    ? allNavItems
    : canAccessOwnOverview(adminLevel)
      ? allNavItems.filter(item => item.title === "Overview" || item.title === "New Sale" || item.title === "Sales History")
      : allNavItems.filter(item => item.title === "New Sale" || item.title === "Sales History");

  useEffect(() => {
    const path = location.pathname;

    const sortedItems = [...allNavItems].sort((a, b) => b.url.length - a.url.length);
    const currentItem = sortedItems.find(item => {
      if (item.url === "/dashboard") return path === "/dashboard";
      return path.startsWith(item.url);
    });
    if (currentItem) setPageTitle(currentItem.title);
  }, [location.pathname]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);

    touchStartX.current = null;
    touchStartY.current = null;

    // Ignore swipes that are too vertical (likely scrolling)
    if (deltaY > SWIPE_MAX_VERTICAL) return;

    const openSidebar  = isMobile ? () => setOpenMobile(true)  : () => setOpen(true);
    const closeSidebar = isMobile ? () => setOpenMobile(false) : () => setOpen(false);

    if (deltaX > SWIPE_THRESHOLD) openSidebar();
    else if (deltaX < -SWIPE_THRESHOLD) closeSidebar();
  }, [isMobile, setOpen, setOpenMobile]);

  return (
    <div
      className="flex min-h-screen w-full flex-col md:flex-row"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <Sidebar>
        <SidebarHeader className="border-b px-4 py-2">
          <h2 className="text-lg font-bold tracking-tight">MHG Store</h2>
          {adminProfile && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="font-medium text-foreground">{adminProfile.full_name}</span>
              <span className="text-xs">({adminLevel})</span>
            </div>
          )}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard"}
                        className={({ isActive }) =>
                          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : ""
                        }
                      >
                        <item.icon className="h-6 w-6" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <div className="mt-auto border-t p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
            <LogOut className="h-6 w-6" /> Sign Out
          </Button>
        </div>
      </Sidebar>

      <SidebarInset className="flex flex-col min-h-dvh">
        <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b bg-background px-4 shrink-0">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold">{pageTitle}</h1>
          </div>
        </header>
        <div className="flex-1">
          <Outlet />
        </div>
      </SidebarInset>
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <DashboardContent />
    </SidebarProvider>
  );
}
