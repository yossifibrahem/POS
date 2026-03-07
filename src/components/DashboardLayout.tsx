import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSignOut } from "@/hooks/useSignOut";
import { useAuth } from "@/hooks/useAuth";
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
import { LayoutDashboard, Package, Tags, ShoppingCart, History, Users, LogOut, User } from "lucide-react";
import { canAccessDashboard } from "@/lib/permissions";
import { useEffect, useState } from "react";

const allNavItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Products", url: "/dashboard/products", icon: Package },
  { title: "Categories", url: "/dashboard/categories", icon: Tags },
  { title: "New Sale", url: "/dashboard/sales", icon: ShoppingCart },
  { title: "Sales History", url: "/dashboard/sales/history", icon: History },
  { title: "Profiles", url: "/dashboard/profiles", icon: Users },
];

export default function DashboardLayout() {
  const { adminLevel, adminProfile } = useAuth();
  const handleSignOut = useSignOut();
  const location = useLocation();
  const [pageTitle, setPageTitle] = useState("Overview");

  // Filter nav items based on admin level
  // Low admins only see New Sale and Sales History
  const navItems = canAccessDashboard(adminLevel) 
    ? allNavItems 
    : allNavItems.filter(item => item.title === "New Sale" || item.title === "Sales History");

  // Update page title based on current route
  useEffect(() => {
    const path = location.pathname;
    const currentItem = allNavItems.find(item => {
      if (item.url === "/dashboard") {
        return path === "/dashboard";
      }
      return path.startsWith(item.url);
    });
    if (currentItem) {
      setPageTitle(currentItem.title);
    }
  }, [location.pathname]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col md:flex-row">
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
    </SidebarProvider>
  );
}
