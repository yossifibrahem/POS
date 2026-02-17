import { NavLink, Outlet } from "react-router-dom";
import { useSignOut } from "@/hooks/useSignOut";
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
import { LayoutDashboard, Package, Tags, Users, ShoppingCart, History, LogOut } from "lucide-react";

const navItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Products", url: "/dashboard/products", icon: Package },
  { title: "Categories", url: "/dashboard/categories", icon: Tags },
  { title: "Customers", url: "/dashboard/customers", icon: Users },
  { title: "New Sale", url: "/dashboard/sales", icon: ShoppingCart },
  { title: "Sales History", url: "/dashboard/sales/history", icon: History },
];

export default function DashboardLayout() {
  const handleSignOut = useSignOut();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col md:flex-row">
        <Sidebar>
          <SidebarHeader className="border-b px-4 py-2">
            <h2 className="text-lg font-bold tracking-tight">Store Admin</h2>
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
  <header className="sticky top-0 z-50 flex h-12 items-center border-b bg-background px-4 shrink-0">
    <SidebarTrigger />
  </header>
  <div className="flex-1">
    <Outlet />
  </div>
</SidebarInset>

      </div>
    </SidebarProvider>
  );
}
