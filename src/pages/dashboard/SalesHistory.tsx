import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canManageRefunds } from "@/lib/permissions";
import { CartDetailModal } from "@/components/CartDetailModal";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Search, ArrowUpRight, ShoppingCart } from "lucide-react";
import { withLoading, handleError, handleSuccess } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { filterCartsByProduct } from "@/lib/filters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";

interface Cart {
  id: string;
  status: string | null;
  total: number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  processed_by_name: string | null;
  refunded_amount: number | null;
  net_amount: number | null;
  refund_status: string | null;
  processed_by_level?: string | null;
  line_items?: { product_name: string | null; sold_quantity: number | null; refunded_quantity: number | null }[];
}


export default function SalesHistory() {
  const { user, adminLevel } = useAuth();
  const [loading, setLoading] = useState(true);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hideRefunded, setHideRefunded] = useState(true);
  const [deleteCartId, setDeleteCartId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterAdmin, setFilterAdmin] = useState<string>("all");
  const [adminList, setAdminList] = useState<{ name: string; level: string }[]>([]);

  const load = useCallback(async () => {
    await withLoading(setLoading, async () => {
      let query = supabase.from("cart_summary").select("*").order("created_at", { ascending: false });
      if (hideRefunded) {
        query = query.neq("refund_status", "fully_refunded");
      }
      if (dateFrom) {
        const [year, month, day] = dateFrom.split("-").map(Number);
        const start = new Date(year, month - 1, day).toISOString();
        query = query.gte("created_at", start);
      }
      if (dateTo) {
        const [year, month, day] = dateTo.split("-").map(Number);
        const end = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
        query = query.lte("created_at", end);
      }
      const { data: cartsData } = await query;
      
      // Fetch line items for each cart to show products
      if (cartsData && cartsData.length > 0) {
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
        
        setCarts(cartsWithItems);
      } else {
        setCarts([]);
      }
    });
  }, [dateFrom, dateTo, hideRefunded]);

  useEffect(() => { load(); }, [load]);

  // Fetch admin list for filter dropdown (med/high only)
  useEffect(() => {
    const fetchAdmins = async () => {
      if (adminLevel === 'low') return;
      const { data: adminsData } = await supabase
        .from("admin_profiles")
        .select("full_name, level")
        .order("full_name");
      setAdminList((adminsData || []).map((a: { full_name: string | null; level: 'high' | 'med' | 'low' }) => ({
        name: a.full_name || "",
        level: a.level || 'low'
      })));
    };
    fetchAdmins();
  }, [adminLevel]);

  // Reset admin filter when toggling hide refunded
  useEffect(() => { setFilterAdmin("all"); }, [hideRefunded]);

  const filteredCarts = filterCartsByProduct(carts, search).filter((c) => {
    if (filterAdmin === "all") return true;
    if (filterAdmin === "__low__") return c.processed_by_level === "low";
    return c.processed_by_name === filterAdmin;
  });

  const handleRefundCart = async () => {
    if (!deleteCartId) return;
    setProcessing(true);
    try {
      // Step 1: Get all line items for this cart to calculate remaining refund quantities
      const { data: lineItems, error: fetchError } = await supabase
        .from("cart_line_items")
        .select("sold_product_id, sold_quantity, refunded_quantity, unit_price")
        .eq("cart_id", deleteCartId);
      
      if (fetchError) throw fetchError;

      if (!lineItems || lineItems.length === 0) {
        throw new Error("No products found in cart");
      }

      // Calculate remaining quantity to refund for each item
      const itemsToRefund = lineItems.map(item => ({
        sold_product_id: item.sold_product_id,
        remaining_quantity: item.sold_quantity - (item.refunded_quantity || 0),
        unit_price: item.unit_price
      })).filter(item => item.remaining_quantity > 0);

      if (itemsToRefund.length === 0) {
        throw new Error("All items have already been fully refunded");
      }

      // Calculate total refund amount (only for remaining quantities)
      const refundAmount = itemsToRefund.reduce((sum, item) => 
        sum + (item.remaining_quantity * item.unit_price), 0
      );

      // Step 2: Insert into refunds table
      const { data: refundData, error: refundError } = await supabase
        .from("refunds")
        .insert({
          cart_id: deleteCartId,
          refund_amount: refundAmount,
          processed_by: user?.id
        })
        .select()
        .single();
      
      if (refundError) throw refundError;
      if (!refundData) throw new Error("Failed to create refund record");

      // Step 3: Insert into refund_items for each remaining quantity
      const refundItems = itemsToRefund.map(item => ({
        refund_id: refundData.id,
        sold_product_id: item.sold_product_id,
        quantity: item.remaining_quantity,
        unit_price: item.unit_price
      }));

      const { error: itemsError } = await supabase
        .from("refund_items")
        .insert(refundItems);
      
      if (itemsError) throw itemsError;

      handleSuccess("Cart refunded successfully. Stock has been restored.");
      setDeleteCartId(null);
      load(); // Refresh the list
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Refund failed";
      handleError(e, errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      {/* Search bar row */}
      <div className="sticky top-[48px] z-10 bg-background py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search by product, customer, note or admin..." 
            className="pl-9" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
      </div>

      {/* Filters row - grid with one row */}
      <div className="sticky top-[96px] z-10 bg-background py-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input type="date" placeholder="Start date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" placeholder="End date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          {adminLevel !== 'low' && (
            <Select value={filterAdmin} onValueChange={setFilterAdmin}>
              <SelectTrigger>
                <SelectValue placeholder="All admins" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All admins</SelectItem>
                <SelectItem value="__low__">Low-level only</SelectItem>
                {adminList.map((a) => (
                  <SelectItem key={a.name} value={a.name}>
                    {a.name}
                    {a.level === 'low' && ' (Low)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Hide refunded</span>
            <Switch
              checked={hideRefunded}
              onCheckedChange={setHideRefunded}
            />
          </div>
        </div>
      </div>

      <div className="pt-4 pb-6">
        <div className="grid gap-4 grid-cols-1">
          {loading ? (
          <LoadingGrid count={4} columns={1} />
        ) : filteredCarts.length > 0 ? (
          filteredCarts.map((c) => (
            <div 
              key={c.id} 
              className="group p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => { setSelectedCartId(c.id); setModalOpen(true); }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium leading-none">
                    {formatDateTime(c.created_at)} • {c.line_items?.length || 0} items
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.customer_name || "Walk-in Customer"} • Processed by: {c.processed_by_name || "Unknown"}
                    {c.processed_by_level === 'low' && (
                      <Badge variant="outline" className="ml-1 text-xs py-0 px-1 text-amber-600 border-amber-300">
                        Low
                      </Badge>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(Number(c.net_amount ?? c.total))}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              
              {/* Products in cart */}
              {c.line_items && c.line_items.length > 0 && (
                <div className="mt-2 pt-2 border-t border-dashed">
                  <p className="text-xs font-medium text-foreground mb-1">Items:</p>
                  <div className="flex flex-wrap gap-2">
                    {c.line_items.slice(0, 4).map((item, idx) => {
                      const refundedQty = item.refunded_quantity || 0;
                      const soldQty = item.sold_quantity || 0;
                      const isFullyRefunded = refundedQty >= soldQty;
                      const isPartiallyRefunded = refundedQty > 0 && !isFullyRefunded;
                      const activeQty = soldQty - refundedQty;
                      
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
                          {item.product_name || "Unknown"} ({isPartiallyRefunded ? `${activeQty}/${soldQty}` : soldQty})
                          {isFullyRefunded && ' - Refunded'}
                          {isPartiallyRefunded && ' - Partial'}
                        </span>
                      );
                    })}
                    {c.line_items.length > 4 && (
                      <span className="text-sm text-muted-foreground px-2 py-1">
                        +{c.line_items.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              {/* Refund button - only show for non-fully-refunded carts and admins with refund permission */}
              {c.refund_status !== 'fully_refunded' && canManageRefunds(adminLevel) && (
                <div className="flex justify-end mt-2 pt-2 border-t border-dashed">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-red-500 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteCartId(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Refund
                  </Button>
                </div>
              )}
            </div>
          ))
          ) : (
            <div className="text-center py-8">
              <ShoppingCart className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{search ? "No sales found matching your search" : "No sales found"}</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteCartId} onOpenChange={(open) => !open && setDeleteCartId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This will return all products to stock and mark the cart as refunded. The cart will be preserved for record-keeping purposes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRefundCart}
              disabled={processing}
              className="bg-red-500 hover:bg-red-600"
            >
              {processing ? "Processing..." : "Refund"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CartDetailModal
        cartId={selectedCartId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onRefund={load}
      />
    </div>
  );
}
