import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CartDetailModal } from "@/components/CartDetailModal";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Trash2, Search } from "lucide-react";
import { withLoading, handleError, handleSuccess } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { updateCartStatusIfAllRefunded } from "@/lib/cart";
import { filterCartsByProduct } from "@/lib/filters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";

interface Cart {
  id: string;
  total: number;
  created_at: string;
  status?: string;
  customers?: { full_name?: string };
  admins?: { id?: string; full_name?: string };
  sold_products?: { quantity: number; refunded_quantity: number; status?: string; products?: { name?: string } }[];
}


export default function SalesHistory() {
  const [loading, setLoading] = useState(true);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showOnlyCompleted, setShowOnlyCompleted] = useState(true);
  const [deleteCartId, setDeleteCartId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    await withLoading(setLoading, async () => {
      let query = supabase.from("carts").select("*, customers(full_name), admins(full_name), sold_products(quantity, refunded_quantity, status, products(name))").order("created_at", { ascending: false });
      if (showOnlyCompleted) {
        query = query.eq("status", "completed");
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
      const { data } = await query;
      
      // Keep all items but mark refunded ones - we'll display them with visual indication
      setCarts(data || []);
    });
  }, [dateFrom, dateTo, showOnlyCompleted]);

  useEffect(() => { load(); }, [load]);

  const handleRefundCart = async () => {
    if (!deleteCartId) return;
    setProcessing(true);
    try {
      // Step 1: Get all active sold_products for this cart
      const { data: soldProducts, error: fetchError } = await supabase
        .from("sold_products")
        .select("id, quantity, refunded_quantity")
        .eq("cart_id", deleteCartId)
        .eq("status", "active");
      
      if (fetchError) throw fetchError;

      // Step 2: Full refund each active item (set refunded_quantity = quantity)
      // DB trigger will:
      // - Restock each row (quantity - old_refunded_quantity units)
      // - Auto-set status = 'refunded' when refunded_quantity = quantity
      if (soldProducts && soldProducts.length > 0) {
        const refundUpdates = soldProducts.map(sp => ({
          id: sp.id,
          refunded_quantity: sp.quantity  // Full refund
        }));

        for (const update of refundUpdates) {
          const { error: updateSoldError } = await supabase
            .from("sold_products")
            .update({ refunded_quantity: update.refunded_quantity })
            .eq("id", update.id);
          
          if (updateSoldError) throw updateSoldError;
        }
      }

      // Step 3: Check if all products are now fully refunded and update cart status
      await updateCartStatusIfAllRefunded(deleteCartId);

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
      <div className="sticky top-[48px] z-10 flex items-center justify-between bg-background py-2">
        <h1 className="text-2xl font-bold">Sales History</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show only completed</span>
          <Switch
            checked={showOnlyCompleted}
            onCheckedChange={setShowOnlyCompleted}
          />
        </div>
      </div>

      <div className="sticky top-[96px] z-10 flex flex-col sm:flex-row gap-3 bg-background py-2 items-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search by product..." 
            className="pl-9" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
        <div className="flex gap-3 items-end">
          <Input type="date" placeholder="Start date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" placeholder="End date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="pt-4 pb-6">
        <div className="grid gap-4 grid-cols-1">
          {loading ? (
          <LoadingGrid count={4} columns={1} />
        ) : filterCartsByProduct(carts, search).length > 0 ? (
          filterCartsByProduct(carts, search).map((c) => (
            <Card key={c.id} className="cursor-pointer w-full" onClick={() => { setSelectedCartId(c.id); setModalOpen(true); }}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{formatDateTime(c.created_at)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
                  <span>{c.customers?.full_name || "Walk-in Customer"}</span>
                  <span className="hidden sm:inline">•</span>
                  <span>Processed by: {c.admins?.full_name || "Unknown"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Items: {c.sold_products?.length || 0}</div>
                  <div className="font-semibold">{formatCurrency(Number(c.total))}</div>
                </div>
                {c.sold_products && c.sold_products.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground mb-1">Products:</div>
                    <div className="flex flex-wrap gap-1">
                      {c.sold_products.slice(0, 5).map((sp, idx) => {
                        const isFullyRefunded = sp.status === 'refunded';
                        const refundedQty = sp.refunded_quantity || 0;
                        const isPartiallyRefunded = refundedQty > 0 && sp.status === 'active';
                        const activeQty = sp.quantity - refundedQty;
                        
                        return (
                          <span 
                            key={idx} 
                            className={`text-xs px-2 py-1 rounded ${
                              isFullyRefunded 
                                ? 'bg-red-100 text-red-600 line-through' 
                                : isPartiallyRefunded
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-muted'
                            }`}
                          >
                            {sp.products?.name || "Unknown"} ({isPartiallyRefunded ? `${activeQty}/${sp.quantity}` : sp.quantity})
                            {isFullyRefunded && ' - Refunded'}
                            {isPartiallyRefunded && ' - Partial'}
                          </span>
                        );
                      })}
                      {c.sold_products.length > 5 && (
                        <span className="text-xs text-muted-foreground px-1">
                          +{c.sold_products.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-end pt-2">
                  {c.status === 'refunded' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled
                      className="gap-1 text-muted-foreground"
                    >
                      Refunded
                    </Button>
                  ) : (
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
                  )}
                </div>
              </CardContent>
            </Card>
          ))
          ) : (
            <EmptyState message={search ? "No sales found matching your search" : "No sales found"} />
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
