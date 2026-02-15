import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Users, ShoppingCart, DollarSign, AlertTriangle } from "lucide-react";

export default function Overview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ products: 0, customers: 0, salesToday: 0, revenueToday: 0 });
  const [recentCarts, setRecentCarts] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];

    Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("carts").select("total").gte("created_at", today),
      supabase.from("carts").select("*, customers(full_name)").order("created_at", { ascending: false }).limit(10),
      supabase.from("products").select("*").lte("stock", 5).order("stock", { ascending: true }),
    ]).then(([productsRes, customersRes, todayCartsRes, recentRes, lowStockRes]) => {
      const todayCarts = todayCartsRes.data || [];
      setStats({
        products: productsRes.count || 0,
        customers: customersRes.count || 0,
        salesToday: todayCarts.length,
        revenueToday: todayCarts.reduce((s, c) => s + Number(c.total), 0),
      });
      setRecentCarts(recentRes.data || []);
      setLowStock(lowStockRes.data || []);
      setLoading(false);
    });
  }, []);

  const statCards = [
    { label: "Total Products", value: stats.products, icon: Package },
    { label: "Total Customers", value: stats.customers, icon: Users },
    { label: "Sales Today", value: stats.salesToday, icon: ShoppingCart },
    { label: "Revenue Today", value: `$${stats.revenueToday.toFixed(2)}`, icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          statCards.map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Sales</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between rounded border p-2">
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </div>
            ) : recentCarts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <div className="space-y-2">
                {recentCarts.map((cart) => (
                  <div key={cart.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div>
                      <p className="font-medium">{(cart.customers as any)?.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(cart.created_at).toLocaleString()}</p>
                    </div>
                    <p className="font-semibold">${Number(cart.total).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between rounded border p-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-10" />
                  </div>
                ))}
              </div>
            ) : lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products well stocked.</p>
            ) : (
              <div className="space-y-2">
                {lowStock.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <span>{p.name}</span>
                    <Badge variant={p.stock === 0 ? "destructive" : "secondary"}>{p.stock} left</Badge>
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
