import { supabase } from "@/integrations/supabase/client";

export interface CartLineItem {
  sold_quantity: number | null;
  refunded_quantity: number | null;
  product_name?: string | null;
}

export interface Cart {
  id: string;
  total: number | null;
  net_amount?: number | null;
  created_at: string;
  status?: string | null;
  refund_status?: string | null;
  customer_name?: string | null;
  processed_by?: string | null;
  processed_by_name?: string | null;
  line_items?: CartLineItem[];
}

export interface Product {
  id: string;
  name: string;
  stock: number | null;
}

export interface DailyStats {
  sales: number;
  revenue: number;
  profit: number;
}

export interface StaticStats {
  products: number;
  categories: number;
  customers: number;
}

interface AdminScope {
  isLowLevelAdmin: boolean;
  userId?: string;
  branchId?: string | null;
}

export function formatOverviewDate(date: Date): string {
  if (isSameDay(date, new Date())) return "Today";

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function canGoToNextDay(date: Date): boolean {
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime();
}

export function isTodayDate(date: Date): boolean {
  return isSameDay(date, new Date());
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function getDateRange(date: Date): { start: string; end: string } {
  const start = startOfDay(date);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function fetchDailyOverview(date: Date, scope: AdminScope) {
  const { start, end } = getDateRange(date);
  const userFilter = scope.isLowLevelAdmin && scope.userId;

  let cartsQuery = supabase
    .from("cart_summary")
    .select("total, net_amount")
    .gte("created_at", start)
    .lte("created_at", end)
    .eq("status", "completed")
    .neq("refund_status", "fully_refunded");

  let lineItemsQuery = supabase
    .from("cart_line_items")
    .select("sold_quantity, refunded_quantity, unit_price, product_cost, carts!inner(created_at, processed_by, branch_id)")
    .gte("carts.created_at", start)
    .lte("carts.created_at", end);

  let recentQuery = supabase
    .from("cart_summary")
    .select("*")
    .eq("status", "completed")
    .gte("created_at", start)
    .lte("created_at", end)
    .neq("refund_status", "fully_refunded")
    .order("created_at", { ascending: false })
    .limit(10);

  if (userFilter) {
    cartsQuery = cartsQuery.eq("processed_by", scope.userId);
    lineItemsQuery = lineItemsQuery.eq("carts.processed_by", scope.userId);
    recentQuery = recentQuery.eq("processed_by", scope.userId);
  }

  if (scope.branchId) {
    cartsQuery = cartsQuery.eq("branch_id", scope.branchId);
    lineItemsQuery = lineItemsQuery.eq("carts.branch_id", scope.branchId);
    recentQuery = recentQuery.eq("branch_id", scope.branchId);
  }

  const [cartsRes, lineItemsRes, recentRes] = await Promise.all([
    cartsQuery,
    lineItemsQuery,
    recentQuery,
  ]);

  if (cartsRes.error) throw cartsRes.error;
  if (lineItemsRes.error) throw lineItemsRes.error;
  if (recentRes.error) throw recentRes.error;

  const carts = cartsRes.data || [];
  const lineItems = lineItemsRes.data || [];
  const recentCarts = await attachLineItems((recentRes.data || []) as Cart[]);

  return {
    dailyStats: {
      sales: carts.length,
      revenue: carts.reduce((sum, cart) => sum + Number(cart.net_amount ?? cart.total), 0),
      profit: lineItems.reduce((total, item) => {
        const netQty = Number(item.sold_quantity || 0) - Number(item.refunded_quantity || 0);
        return total + (Number(item.unit_price || 0) - Number(item.product_cost || 0)) * netQty;
      }, 0),
    },
    recentCarts,
  };
}

export async function fetchStaticOverview(branchId?: string | null) {
  let outOfStockQuery = supabase
    .from("products_with_branch_stock")
    .select("id, name, stock")
    .eq("stock", 0)
    .order("name", { ascending: true });

  if (branchId) outOfStockQuery = outOfStockQuery.eq("branch_id", branchId);

  const [productsRes, categoriesRes, customersRes, outOfStockRes] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("categories").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    outOfStockQuery,
  ]);

  if (productsRes.error) throw productsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (customersRes.error) throw customersRes.error;
  if (outOfStockRes.error) throw outOfStockRes.error;

  return {
    staticStats: {
      products: productsRes.count || 0,
      categories: categoriesRes.count || 0,
      customers: customersRes.count || 0,
    },
    outOfStock: (outOfStockRes.data || []) as Product[],
  };
}

async function attachLineItems(carts: Cart[]): Promise<Cart[]> {
  if (!carts.length) return [];

  const { data, error } = await supabase
    .from("cart_line_items")
    .select("cart_id, product_name, sold_quantity, refunded_quantity")
    .in("cart_id", carts.map((cart) => cart.id));

  if (error) throw error;

  const lineItemsByCart = (data || []).reduce<Record<string, CartLineItem[]>>((byCart, item) => {
    byCart[item.cart_id] ??= [];
    byCart[item.cart_id].push({
      product_name: item.product_name,
      sold_quantity: item.sold_quantity,
      refunded_quantity: item.refunded_quantity,
    });
    return byCart;
  }, {});

  return carts.map((cart) => ({
    ...cart,
    line_items: lineItemsByCart[cart.id] || [],
  }));
}
