import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, Users, ShoppingCart, DollarSign, AlertTriangle, TrendingUp, Clock, ArrowUpRight, Tags } from "lucide-react";
import { formatCurrency, formatDateTime, getLocalDateRange, formatRelativeTime } from "@/lib/formatters";
import { StatCardSkeleton, LoadingGrid } from "@/components/LoadingGrid";
import { CartDetailModal } from "@/components/CartDetailModal";

interface Cart {
  id: string;
  total: number;
  created_at: string;
  status?: string;
  refund_status?: string;
  customers?: { profiles?: { full_name?: string } | null };
  admins?: { profiles?: { full_name?: string } | null };
  line_items?: { sold_quantity: number; refunded_quantity: number; product_name?: string }[];
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
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const { start, end } = getLocalDateRange();

    Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("categories").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("cart_summary").select("total").gte("created_at", start).lte("created_at", end).eq("status", "completed").neq("refund_status", "fully_refunded"),
      supabase.from("cart_summary").select("*").eq("status", "completed").gte("created_at", start).lte("created_at", end).neq("refund_status", "fully_refunded").order("created_at", { ascending: false }).limit(10),
      supabase.from("products").select("*").lte("stock", 5).order("stock", { ascending: true }),
      supabase.from("sold_products").select("quantity, unit_price, products(cost)").gte("created_at", start).lte("created_at", end),
    ]).then(async ([productsRes, categoriesRes, customersRes, todayCartsRes, recentRes, lowStockRes, soldProductsRes]) => {
      const todayCarts = todayCartsRes.data || [];
      const soldProducts = soldProductsRes.data || [];
      const cartsData = recentRes.data || [];
      
      // Calculate profit: (unit_price - cost) * quantity
      // Note: This is approximate as we don't track cost at time of sale
      const profitToday = soldProducts.reduce((total, sp) => {
        const cost = Number(sp.products?.cost || 0);
        const unitPrice = Number(sp.unit_price || 0);
        const quantity = Number(sp.quantity || 0);
        return total + ((unitPrice - cost) * quantity);
      }, 0);
      
      // Fetch line items for each cart
      if (cartsData.length > 0) {
        const cartIds = cartsData.map(c => c.id);
        const { data: lineItemsData } = await supabase
          .from("cart_line_items")
          .select("cart_id, product_name, sold_quantity, refunded_quantity")
          .in("cart_id", cartIds);
        
        // Group line items by cart_id
        const lineItemsByCart: Record<string, { product_name: string | null; sold_quantity: number | null; refunded_quantity: number | null }[]> = {};
        lineItemsData?.forEach(item => {
          if (!lineItemsByCart[item.cart_id]) {
            lineItemsByCart[item.cart_id] = [];
          }
          lineItemsByCart[item.cart_id].push({
            product_name: item.product_name,
            sold_quantity: item.sold_quantity,
            refunded_quantity: item.refunded_quantity
          });
        });
        
        // Attach line items to each cart
        const cartsWithItems = cartsData.map(cart => ({
          ...cart,
          line_items: lineItemsByCart[cart.id] || []
        }));
        
        setRecentCarts(cartsWithItems);
      } else {
        setRecentCarts([]);
      }
      
      setStats({
        products: productsRes.count || 0,
        categories: categoriesRes.count || 0,
        customers: customersRes.count || 0,
        salesToday: todayCarts.length,
        revenueToday: todayCarts.reduce((s, c) => s + Number(c.total), 0),
        profitToday,
      });
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
                <CardTitle className="text-base font-semibold">Sales Today</CardTitle>
                <CardDescription>Today's completed transactions</CardDescription>
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
                {recentCarts.slice(0, 3).map((cart) => (
                  <div 
                    key={cart.id} 
                    className="group p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => { setSelectedCartId(cart.id); setModalOpen(true); }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium leading-none">
                          {formatRelativeTime(cart.created_at)} • {cart.line_items?.length || 0} items
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Processed by: {cart.admins?.profiles?.full_name || "Unknown"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{formatCurrency(Number(cart.total))}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-dashed">
                      <p className="text-xs font-medium text-foreground mb-1">Items:</p>
                      {cart.line_items && cart.line_items.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {cart.line_items.slice(0, 4).map((item, idx) => {
                            const refundedQty = item.refunded_quantity || 0;
                            const isFullyRefunded = refundedQty >= item.sold_quantity;
                            const isPartiallyRefunded = refundedQty > 0 && !isFullyRefunded;
                            const activeQty = item.sold_quantity - refundedQty;
                            
                            return (
                              <span 
                                key={idx} 
                                className={`text-sm px-3 py-1 rounded-md ${
                                  isFullyRefunded 
                                    ? 'bg-red-100 text-red-600 line-through' 
                                    : isPartiallyRefunded
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {item.product_name || "Unknown"} ({isPartiallyRefunded ? `${activeQty}/${item.sold_quantity}` : item.sold_quantity})
                                {isFullyRefunded && ' - Refunded'}
                                {isPartiallyRefunded && ' - Partial'}
                              </span>
                            );
                          })}
                          {cart.line_items.length > 4 && (
                            <span className="text-sm text-muted-foreground px-2 py-1">
                              +{cart.line_items.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
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
                {lowStock.slice(0, 5).map((p) => (
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
                {lowStock.length > 5 && (
                  <div 
                    className="flex items-center justify-center p-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    onClick={() => navigate('/dashboard/products?sort=stock-asc')}
                  >
                    View all {lowStock.length} low stock products →
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CartDetailModal
        cartId={selectedCartId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onRefund={() => {
          // Refresh the data after refund
          const { start, end } = getLocalDateRange();
          Promise.all([
            supabase.from("products").select("id", { count: "exact", head: true }),
            supabase.from("categories").select("id", { count: "exact", head: true }),
            supabase.from("customers").select("id", { count: "exact", head: true }),
            supabase.from("cart_summary").select("total").gte("created_at", start).lte("created_at", end).eq("status", "completed").neq("refund_status", "fully_refunded"),
            supabase.from("cart_summary").select("*").eq("status", "completed").gte("created_at", start).lte("created_at", end).neq("refund_status", "fully_refunded").order("created_at", { ascending: false }).limit(10),
            supabase.from("products").select("*").lte("stock", 5).order("stock", { ascending: true }),
            supabase.from("sold_products").select("quantity, unit_price, products(cost)").gte("created_at", start).lte("created_at", end),
          ]).then(async ([productsRes, categoriesRes, customersRes, todayCartsRes, recentRes, lowStockRes, soldProductsRes]) => {
            const todayCarts = todayCartsRes.data || [];
            const soldProducts = soldProductsRes.data || [];
            const cartsData = recentRes.data || [];
            
            const profitToday = soldProducts.reduce((total, sp) => {
              const cost = Number(sp.products?.cost || 0);
              const unitPrice = Number(sp.unit_price || 0);
              const quantity = Number(sp.quantity || 0);
              return total + ((unitPrice - cost) * quantity);
            }, 0);

            // Fetch line items for each cart
            if (cartsData.length > 0) {
              const cartIds = cartsData.map(c => c.id);
              const { data: lineItemsData } = await supabase
                .from("cart_line_items")
                .select("cart_id, product_name, sold_quantity, refunded_quantity")
                .in("cart_id", cartIds);
              
              // Group line items by cart_id
              const lineItemsByCart: Record<string, { product_name: string | null; sold_quantity: number; refunded_quantity: number }[]> = {};
              lineItemsData?.forEach(item => {
                if (!lineItemsByCart[item.cart_id]) {
                  lineItemsByCart[item.cart_id] = [];
                }
                lineItemsByCart[item.cart_id].push({
                  product_name: item.product_name,
                  sold_quantity: item.sold_quantity,
                  refunded_quantity: item.refunded_quantity
                });
              });
              
              // Attach line items to each cart
              const cartsWithItems = cartsData.map(cart => ({
                ...cart,
                line_items: lineItemsByCart[cart.id] || []
              }));
              
              setRecentCarts(cartsWithItems);
            } else {
              setRecentCarts([]);
            }
            
            setStats({
              products: productsRes.count || 0,
              categories: categoriesRes.count || 0,
              customers: customersRes.count || 0,
              salesToday: todayCarts.length,
              revenueToday: todayCarts.reduce((s, c) => s + Number(c.total), 0),
              profitToday,
            });
            setLowStock(lowStockRes.data || []);
          });
        }}
      />
    </div>
  );
}
