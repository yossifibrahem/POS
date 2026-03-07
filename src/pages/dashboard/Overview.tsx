import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canSeeCostAndProfit } from "@/lib/permissions";
import { useCartRealtime, useInventoryRealtime } from "@/hooks/useRealtimeSubscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Users, ShoppingCart, DollarSign, XCircle,TrendingUp,ChevronLeft,ChevronRight,Calendar,Tags} from "lucide-react";
import { formatCurrency, formatDateTime, formatRelativeTime } from "@/lib/formatters";
import { StatCardSkeleton } from "@/components/LoadingGrid";
import { CartDetailModal } from "@/components/CartDetailModal";

interface Cart {
  id: string;
  total: number;
  net_amount?: number;
  created_at: string;
  status?: string;
  refund_status?: string;
  customer_name?: string | null;
  processed_by_name?: string | null;
  line_items?: { sold_quantity: number; refunded_quantity: number; product_name?: string }[];
}

interface Product {
  id: string;
  name: string;
  stock: number;
}

interface DailyStats {
  sales: number;
  revenue: number;
  profit: number;
}

function formatDateForDisplay(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  if (targetDate.getTime() === today.getTime()) {
    return "Today";
  }
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (targetDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }
  
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDateRange(date: Date): { start: string; end: string } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export default function Overview() {
  const navigate = useNavigate();
  const { adminLevel } = useAuth();
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [loadingStatic, setLoadingStatic] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyStats, setDailyStats] = useState<DailyStats>({ sales: 0, revenue: 0, profit: 0 });
  const [recentCarts, setRecentCarts] = useState<Cart[]>([]);
  const [staticStats, setStaticStats] = useState({ products: 0, categories: 0, customers: 0 });
  const [outOfStock, setOutOfStock] = useState<Product[]>([]);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchDailyData = useCallback(async (date: Date) => {
    setLoadingDaily(true);
    const { start, end } = getDateRange(date);

    try {
      const [cartsRes, lineItemsRes, recentRes] = await Promise.all([
        supabase
          .from("cart_summary")
          .select("total, net_amount")
          .gte("created_at", start)
          .lte("created_at", end)
          .eq("status", "completed")
          .neq("refund_status", "fully_refunded"),
        supabase
          .from("cart_line_items")
          .select("sold_quantity, refunded_quantity, unit_price, product_cost, carts!inner(created_at)")
          .gte("carts.created_at", start)
          .lte("carts.created_at", end),
        supabase
          .from("cart_summary")
          .select("*")
          .eq("status", "completed")
          .gte("created_at", start)
          .lte("created_at", end)
          .neq("refund_status", "fully_refunded")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const todayCarts = cartsRes.data || [];
      const lineItems = lineItemsRes.data || [];
      const cartsData = recentRes.data || [];

      const profit = lineItems.reduce((total, item) => {
        const cost = Number(item.product_cost || 0);
        const unitPrice = Number(item.unit_price || 0);
        const soldQty = Number(item.sold_quantity || 0);
        const refundedQty = Number(item.refunded_quantity || 0);
        const netQty = soldQty - refundedQty;
        return total + ((unitPrice - cost) * netQty);
      }, 0);

      if (cartsData.length > 0) {
        const cartIds = cartsData.map(c => c.id);
        const { data: lineItemsData } = await supabase
          .from("cart_line_items")
          .select("cart_id, product_name, sold_quantity, refunded_quantity")
          .in("cart_id", cartIds);

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

        const cartsWithItems = cartsData.map(cart => ({
          ...cart,
          line_items: lineItemsByCart[cart.id] || []
        }));

        setRecentCarts(cartsWithItems);
      } else {
        setRecentCarts([]);
      }

      setDailyStats({
        sales: todayCarts.length,
        revenue: todayCarts.reduce((s, c) => s + Number(c.net_amount ?? c.total), 0),
        profit,
      });
    } catch (error) {
      console.error("Error fetching daily data:", error);
    } finally {
      setLoadingDaily(false);
    }
  }, []);

  const fetchStaticData = useCallback(async () => {
    setLoadingStatic(true);

    try {
      const [productsRes, categoriesRes, customersRes, outOfStockRes] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("categories").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("products").select("*").eq("stock", 0).order("name", { ascending: true }),
      ]);

      setStaticStats({
        products: productsRes.count || 0,
        categories: categoriesRes.count || 0,
        customers: customersRes.count || 0,
      });
      setOutOfStock(outOfStockRes.data || []);
    } catch (error) {
      console.error("Error fetching static data:", error);
    } finally {
      setLoadingStatic(false);
    }
  }, []);

  useEffect(() => {
    fetchDailyData(selectedDate);
  }, [selectedDate, fetchDailyData]);

  useEffect(() => {
    fetchStaticData();
  }, [fetchStaticData]);

  const handlePreviousDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (next.getTime() <= today.getTime()) {
      setSelectedDate(next);
    }
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const canGoNext = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return selected.getTime() < today.getTime();
  };

  // Check if selected date is today
  const isToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return selected.getTime() === today.getTime();
  }, [selectedDate]);

  // Real-time cart updates (sales, revenue, profit, transactions)
  // Only active when viewing today
  const handleCartChange = useCallback(() => {
    if (isToday) {
      fetchDailyData(selectedDate);
    }
  }, [isToday, selectedDate, fetchDailyData]);

  useCartRealtime({
    onChange: handleCartChange,
  });

  // Real-time inventory updates (products, categories, out of stock)
  // Always active as these can change at any time
  const handleInventoryChange = useCallback(() => {
    fetchStaticData();
  }, [fetchStaticData]);

  useInventoryRealtime({
    onChange: handleInventoryChange,
  });

  const refreshData = () => {
    fetchDailyData(selectedDate);
    fetchStaticData();
  };

  const dailyStatCards = [
    { label: "Sales", value: dailyStats.sales, icon: ShoppingCart, color: "text-muted-foreground", bgColor: "bg-muted" },
    { label: "Revenue", value: formatCurrency(dailyStats.revenue), icon: DollarSign, color: "text-muted-foreground", bgColor: "bg-muted" },
    { label: "Profit", value: formatCurrency(dailyStats.profit), icon: TrendingUp, color: "text-muted-foreground", bgColor: "bg-muted" },
  ];

  const staticStatCards = [
    { label: "Products", value: staticStats.products, icon: Package, description: "In inventory", to: "/dashboard/products" },
    { label: "Categories", value: staticStats.categories, icon: Tags, description: "Product groups", to: "/dashboard/categories" },
    { label: "Customers", value: staticStats.customers, icon: Users, description: "Registered", to: "/dashboard/customers" },
    { label: "Out of Stock", value: outOfStock.length, icon: XCircle, description: "Need restock", to: "/dashboard/products?sort=stock-asc" },
  ];

  const filteredDailyStats = canSeeCostAndProfit(adminLevel)
    ? dailyStatCards
    : dailyStatCards.filter(card => card.label !== "Profit");

  return (
    <div className="p-4 md:p-6 space-y-8">
      {/* Inventory Overview Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-muted rounded-lg">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Inventory Overview</h2>
            <p className="text-sm text-muted-foreground">Your store metrics at a glance</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loadingStatic ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <StatCardSkeleton key={i} />
              ))}
            </>
          ) : (
            staticStatCards.map((stat) => (
              <Card 
                key={stat.label}
                className="hover:shadow-md transition-all cursor-pointer"
                onClick={() => navigate(stat.to)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.description}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-xl">
                      <stat.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* Daily Updated Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-muted rounded-lg">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Daily Overview</h2>
              <p className="text-sm text-muted-foreground">Monitor your daily performance</p>
            </div>
          </div>
          
          {/* Date Navigation */}
          <div className="flex justify-between items-center gap-2 bg-muted/50 rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handlePreviousDay}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="px-3 h-8 font-medium min-w-[120px]"
              onClick={handleToday}
            >
              {formatDateForDisplay(selectedDate)}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleNextDay}
              disabled={!canGoNext()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Daily Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-3">
          {loadingDaily ? (
            <>
              {[1, 2, 3].map((i) => (
                <StatCardSkeleton key={i} />
              ))}
            </>
          ) : (
            filteredDailyStats.map((stat) => (
              <Card 
                key={stat.label} 
                className="transition-colors"
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                    </div>
                    <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Recent Transactions */}
        <Card className="overflow-hidden border-muted/60">
          <CardHeader className="pb-3 border-b shrink-0 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Transactions</CardTitle>
              </div>
              <Badge variant="secondary" className="text-xs bg-muted">
                {recentCarts.length} orders
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-[500px] overflow-y-auto">
            {loadingDaily ? (
              <div className="p-4 space-y-3">
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
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="relative mb-4">
                  <div className="p-4 bg-muted rounded-full">
                    <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 p-1.5 bg-background rounded-full border">
                    <XCircle className="h-3 w-3 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-sm font-medium text-foreground">No transactions yet</p>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-[200px]">
                  No sales recorded for {formatDateForDisplay(selectedDate).toLowerCase()}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-muted/50">
                {recentCarts.map((cart) => {
                  const totalItems = cart.line_items?.reduce((sum, item) => {
                    const sold = item.sold_quantity || 0;
                    const refunded = item.refunded_quantity || 0;
                    return sum + (sold - refunded);
                  }, 0) || 0;
                  
                  const isRefunded = cart.refund_status === 'fully_refunded';
                  const isPartialRefund = cart.refund_status === 'partially_refunded';
                  
                  return (
                    <div 
                      key={cart.id} 
                      className="group p-4 hover:bg-muted/40 transition-all duration-200 cursor-pointer"
                      onClick={() => { setSelectedCartId(cart.id); setModalOpen(true); }}
                    >
                      {/* Primary: Processed By & Time Info */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {/* Admin/Processor Avatar */}
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-primary">
                              {(cart.processed_by_name || "U").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[140px]">
                              {cart.processed_by_name || "Unknown"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {cart.customer_name || "Walk-in"} • {formatRelativeTime(cart.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className={`text-lg font-bold ${isRefunded ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {formatCurrency(Number(cart.net_amount ?? cart.total))}
                          </p>
                        </div>
                      </div>

                      {/* Secondary: Products Summary */}
                      <div className="pt-2 border-t border-muted/30">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">
                            {totalItems} {totalItems === 1 ? 'item' : 'items'}
                          </span>
                          {(isRefunded || isPartialRefund) && (
                            <Badge 
                              variant={isRefunded ? "destructive" : "secondary"} 
                              className="text-[10px] h-5 px-2 ml-auto"
                            >
                              {isRefunded ? "Refunded" : "Partial Refund"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cart.line_items && cart.line_items.slice(0, 4).map((item, idx) => {
                            const refundedQty = item.refunded_quantity || 0;
                            const soldQty = item.sold_quantity || 0;
                            const isItemRefunded = refundedQty >= soldQty;
                            const isPartiallyRefunded = refundedQty > 0 && refundedQty < soldQty;
                            const activeQty = soldQty - refundedQty;
                            const productName = item.product_name?.split(' - ')[0] || "Unknown";
                            
                            return (
                              <span 
                                key={idx} 
                                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                                  isItemRefunded 
                                    ? "bg-muted/50 text-muted-foreground line-through decoration-muted-foreground/50" 
                                    : isPartiallyRefunded
                                      ? "bg-muted/30 border-muted text-muted-foreground"
                                      : "bg-background text-foreground border-muted"
                                }`}
                              >
                                {isPartiallyRefunded ? (
                                  <>
                                    <span className="font-medium text-[10px] bg-muted text-muted-foreground px-1 rounded">
                                      {activeQty}/{soldQty}
                                    </span>
                                    <span className="truncate max-w-[80px]">{productName}</span>
                                  </>
                                ) : (
                                  <>
                                    {!isItemRefunded && (
                                      <span className="font-medium text-[10px] bg-primary/10 text-primary px-1 rounded">
                                        {activeQty}
                                      </span>
                                    )}
                                    <span className="truncate max-w-[100px]">{productName}</span>
                                  </>
                                )}
                              </span>
                            );
                          })}
                          {cart.line_items && cart.line_items.length > 4 && (
                            <span className="inline-flex items-center text-xs text-muted-foreground px-2 py-1">
                              +{cart.line_items.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <CartDetailModal
        cartId={selectedCartId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onRefund={refreshData}
      />
    </div>
  );
}

