import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, Users, ShoppingCart, DollarSign, AlertTriangle, TrendingUp, Clock, ArrowUpRight, Tags } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { StatCardSkeleton, LoadingGrid } from "@/components/LoadingGrid";

/**
 * Format a date to relative time (e.g., "2 hours ago", "Just now")
 */
function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return formatDateTime(date);
}

interface Cart {
  id: string;
  total: number;
  created_at: string;
  customers?: { full_name?: string };
}

interface Product {
  id: string;
  name: string;
  stock: number;
}

export default function Overview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ products: 0, categories: 0, customers: 0, salesToday: 0, revenueToday: 0, profitToday: 0 });
  const [recentCarts, setRecentCarts] = useState<Cart[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];

    Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("categories").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("carts").select("total").gte("created_at", today).eq("status", "completed"),
      supabase.from("carts").select("*, customers(full_name)").order("created_at", { ascending: false }).limit(10),
      supabase.from("products").select("*").lte("stock", 5).order("stock", { ascending: true }),
      supabase.from("sold_products").select("quantity, refunded_quantity, unit_price, products(cost)").gte("created_at", today),
    ]).then(([productsRes, categoriesRes, customersRes, todayCartsRes, recentRes, lowStockRes, soldProductsRes]) => {
      const todayCarts = todayCartsRes.data || [];
      const soldProducts = soldProductsRes.data || [];
      
      // Calculate profit: (unit_price - cost) * (quantity - refunded_quantity)
      const profitToday = soldProducts.reduce((total, sp) => {
        const cost = Number(sp.products?.cost || 0);
        const unitPrice = Number(sp.unit_price || 0);
        const quantity = Number(sp.quantity || 0);
        const refundedQty = Number(sp.refunded_quantity || 0);
        const activeQty = quantity - refundedQty;
        return total + ((unitPrice - cost) * activeQty);
      }, 0);
      
      setStats({
        products: productsRes.count || 0,
        categories: categoriesRes.count || 0,
        customers: customersRes.count || 0,
        salesToday: todayCarts.length,
        revenueToday: todayCarts.reduce((s, c) => s + Number(c.total), 0),
        profitToday,
      });
      setRecentCarts(recentRes.data || []);
      setLowStock(lowStockRes.data || []);
      setLoading(false);
    });
  }, []);

  const statCards = [
    { label: "Total Products", value: stats.products, icon: Package, description: "In inventory", to: "/dashboard/products" },
    { label: "Total Categories", value: stats.categories, icon: Tags, description: "Product groups", to: "/dashboard/categories" },
    { label: "Total Customers", value: stats.customers, icon: Users, description: "Registered", to: "/dashboard/customers" },
    { label: "Sales Today", value: stats.salesToday, icon: ShoppingCart, description: "Completed orders", to: "/dashboard/sales/history" },
    { label: "Revenue Today", value: formatCurrency(stats.revenueToday), icon: DollarSign, description: "Total sales", to: "/dashboard/sales/history" },
    { label: "Profit Today", value: formatCurrency(stats.profitToday), icon: TrendingUp, description: "Net earnings", to: "/dashboard/sales/history" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="sticky top-[48px] z-10 bg-background py-2">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your store performance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {loading ? (
          <>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <StatCardSkeleton key={i} />
            ))}
          </>
        ) : (
          statCards.map((s) => (
            <Card 
              key={s.label} 
              className="hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer"
              onClick={() => navigate(s.to)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {s.label}
                </CardTitle>
                <div className="p-1.5 bg-muted rounded-md">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold tracking-tight">{s.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Recent Sales</CardTitle>
                <CardDescription>Latest completed transactions</CardDescription>
              </div>
              <div className="p-2 bg-muted rounded-md">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-1">
                      <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : recentCarts.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No sales recorded yet</p>
                <p className="text-xs text-muted-foreground mt-1">New sales will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentCarts.slice(0, 8).map((cart, index) => (
                  <div 
                    key={cart.id} 
                    className="group flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                        {(cart.customers?.full_name || "W").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-none">
                          {cart.customers?.full_name || "Walk-in Customer"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatRelativeTime(cart.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatCurrency(Number(cart.total))}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Low Stock Alerts
                </CardTitle>
                <CardDescription>Products requiring attention</CardDescription>
              </div>
              <div className="p-2 bg-muted rounded-md">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                    <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : lowStock.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All products well stocked</p>
                <p className="text-xs text-muted-foreground mt-1">No action required</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lowStock.map((p) => (
                  <div 
                    key={p.id} 
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${p.stock === 0 ? 'bg-destructive' : 'bg-amber-500'}`} />
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    <Badge 
                      variant={p.stock === 0 ? "destructive" : "outline"} 
                      className="text-xs"
                    >
                      {p.stock === 0 ? "Out of stock" : `${p.stock} left`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
