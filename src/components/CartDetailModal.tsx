import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCcw, Package, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Json } from "@/integrations/supabase/types";
import { updateCartStatusIfAllRefunded } from "@/lib/cart";

type CartRow = { 
  id: string; 
  total: number; 
  created_at: string; 
  notes?: string | null; 
  customers?: { full_name?: string; email?: string }; 
  admins?: { customers?: { full_name?: string } } 
};

type SoldItemRow = { 
  id: string; 
  product_id: string; 
  quantity: number; 
  refunded_quantity: number;
  status: string;
  unit_price: number; 
  products?: { 
    name?: string; 
    stock?: number; 
    price?: number;
    cost?: number;
    attributes?: Json;
    categories?: { name?: string } | null;
  } 
};

interface CartDetailModalProps {
  cartId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefund?: () => void;
}

export function CartDetailModal({ cartId, open, onOpenChange, onRefund }: CartDetailModalProps) {
  const [cart, setCart] = useState<CartRow | null>(null);
  const [items, setItems] = useState<SoldItemRow[]>([]);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    if (!cartId) return;
    const [cartRes, itemsRes] = await Promise.all([
      supabase.from("carts").select("*, customers(full_name, email), admins(customers:customers(full_name))").eq("id", cartId).single(),
      // Fetch all sold_products including refunded ones for full history
      supabase.from("sold_products").select("*, products(name, stock, price, cost, attributes, categories(name))").eq("cart_id", cartId),
    ]);
    if (cartRes.data) setCart(cartRes.data);
    setItems(itemsRes.data || []);
  }, [cartId]);

  useEffect(() => {
    if (!open || !cartId) {
      setCart(null);
      setItems([]);
      setReturnQty({});
    }
  }, [open, cartId]);

  useEffect(() => {
    if (open && cartId) {
      loadData();
    }
  }, [open, cartId, loadData]);

  const handlePartialReturn = async (item: SoldItemRow) => {
    const currentRefunded = item.refunded_quantity || 0;
    const qty = returnQty[item.id] ?? 1;
    const newRefundedQty = currentRefunded + qty;
    if (qty < 1 || newRefundedQty > item.quantity) return;
    setReturningId(item.id);
    try {
      // Update refunded_quantity - DB trigger will:
      // 1. Restock the delta (new - old refunded_quantity)
      // 2. Auto-set status = 'refunded' when refunded_quantity = quantity
      const { error: updateError } = await supabase
        .from("sold_products")
        .update({ refunded_quantity: newRefundedQty })
        .eq("id", item.id)
        .eq("status", "active");

      if (updateError) throw updateError;

      // Check if all products are now fully refunded and update cart status
      if (cartId) {
        await updateCartStatusIfAllRefunded(cartId);
        if (onRefund) {
          onRefund();
        }
      }

      // Database trigger will recalculate cart total
      setReturnQty((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await loadData();
      toast.success(`Returned ${qty} unit(s). Stock restored.`);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Return failed";
      toast.error(errorMessage);
    } finally {
      setReturningId(null);
    }
  };

  // Helper function to safely parse attributes
  const getAttributes = (attributes: Json | undefined): Record<string, string | number | boolean> => {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      return {};
    }
    return attributes as Record<string, string | number | boolean>;
  };

  if (!cart) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center justify-between">
            <span>Sale Details</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-8rem)] px-6 pb-6">
          <div className="space-y-4">
            {/* Sale Info Card */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="font-medium">Customer:</span> {cart.customers?.full_name || "Walk-in Customer"}</p>
                <p><span className="font-medium">Processed by:</span> {cart.admins?.customers?.full_name || "Unknown"}</p>
                <p><span className="font-medium">Date:</span> {new Date(cart.created_at).toLocaleString()}</p>
                <p><span className="font-medium">Total:</span> ${Number(cart.total).toFixed(2)}</p>
                {cart.notes && <p className="sm:col-span-2"><span className="font-medium">Notes:</span> {cart.notes}</p>}
              </div>
            </div>

            {/* Items List */}
            {items.length > 0 && (
              <div className="grid gap-4 grid-cols-1">
                {items.map((item) => {
                  const attributes = getAttributes(item.products?.attributes);
                  const hasAttributes = Object.keys(attributes).length > 0;
                  const refundedQty = item.refunded_quantity || 0;
                  const isFullyRefunded = item.status === 'refunded';
                  const isPartiallyRefunded = refundedQty > 0 && item.status === 'active';
                  const activeQuantity = item.quantity - refundedQty;
                  const activeSubtotal = activeQuantity * Number(item.unit_price);
                  const refundedSubtotal = refundedQty * Number(item.unit_price);
                  
                  return (
                    <div key={item.id} className={`rounded-lg border bg-card p-4 ${isFullyRefunded ? 'opacity-60 bg-red-50' : ''}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          {item.products?.name}
                        </div>
                        <div className="flex items-center gap-2">
                          {isFullyRefunded && (
                            <Badge variant="destructive" className="text-xs">
                              Refunded
                            </Badge>
                          )}
                          {isPartiallyRefunded && (
                            <Badge variant="outline" className="text-xs bg-yellow-50">
                              Partial Refund
                            </Badge>
                          )}
                          {item.products?.categories?.name && (
                            <Badge variant="secondary" className="text-xs">
                              {item.products.categories.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Sold Qty</span>
                          <span className="font-medium">{item.quantity}</span>
                        </div>
                        {isPartiallyRefunded && (
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>Refunded</span>
                            <span className="line-through">-{refundedQty}</span>
                          </div>
                        )}
                        {isPartiallyRefunded && (
                          <div className="flex items-center justify-between text-sm">
                            <span>Active Qty</span>
                            <span className="font-medium">{activeQuantity}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <span>Unit Price</span>
                          <span className="font-medium">${Number(item.products?.price || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Sold Price</span>
                          <span className="font-medium">${Number(item.unit_price).toFixed(2)}</span>
                        </div>
                        {item.products?.price && item.products.price > item.unit_price && (
                          <div className="flex items-center justify-between text-sm text-green-600">
                            <span>Discount</span>
                            <span className="font-medium">-${(item.products.price - item.unit_price).toFixed(2)}</span>
                          </div>
                        )}
                        {item.products?.price && item.products.price < item.unit_price && (
                          <div className="flex items-center justify-between text-sm text-amber-600">
                            <span>Extra</span>
                            <span className="font-medium">+${(item.unit_price - item.products.price).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <span>Unit Cost</span>
                          <span className="font-medium">${Number(item.products?.cost || 0).toFixed(2)}</span>
                        </div>
                        <Separator className="my-2" />
                        {item.products?.price && item.products.price > item.unit_price && (
                          <div className="flex items-center justify-between text-sm">
                            <span>Line Discount</span>
                            <span className="font-medium text-green-600">
                              ${((item.products.price - item.unit_price) * activeQuantity).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <span>Line Total</span>
                          <span className={`font-semibold ${isFullyRefunded ? 'line-through' : ''}`}>${activeSubtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Line Profit</span>
                          <span className={`font-semibold ${((item.unit_price - Number(item.products?.cost || 0)) * activeQuantity) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${((item.unit_price - Number(item.products?.cost || 0)) * activeQuantity).toFixed(2)}
                          </span>
                        </div>
                        
                        {/* Product Attributes Section */}
                        {hasAttributes && (
                          <>
                            <Separator className="my-2" />
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Product Attributes
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(attributes).map(([key, value]) => (
                                  <div key={key} className="flex flex-col">
                                    <span className="text-xs text-muted-foreground capitalize">
                                      {key.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-sm font-medium">
                                      {typeof value === 'boolean' 
                                        ? (value ? 'Yes' : 'No')
                                        : String(value)
                                      }
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Return Section - only show for active items */}
                        {!isFullyRefunded && activeQuantity > 0 && (
                          <div className="flex items-center justify-between gap-2 pt-2 border-t">
                            <Select
                              value={String(returnQty[item.id] ?? 1)}
                              onValueChange={(v) => setReturnQty((p) => ({ ...p, [item.id]: parseInt(v, 10) }))}
                            >
                              <SelectTrigger className="h-8 w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: activeQuantity }, (_, i) => i + 1).map((n) => (
                                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 h-8 text-red-500 hover:text-red-600"
                              onClick={() => handlePartialReturn(item)}
                              disabled={returningId === item.id}
                            >
                              {returningId === item.id ? "..." : <><RotateCcw className="h-3 w-3" /> Return</>}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cart Totals Summary */}
            {items.length > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-2 mt-4">
                <div className="text-sm font-semibold mb-3">Cart Summary</div>
                {(() => {
                  const totalDiscount = items.reduce((sum, item) => {
                    const activeQty = item.quantity - (item.refunded_quantity || 0);
                    const originalPrice = item.products?.price || 0;
                    const discountPerUnit = originalPrice > item.unit_price ? originalPrice - item.unit_price : 0;
                    return sum + (discountPerUnit * activeQty);
                  }, 0);
                  
                  const totalProfit = items.reduce((sum, item) => {
                    const activeQty = item.quantity - (item.refunded_quantity || 0);
                    const cost = item.products?.cost || 0;
                    return sum + ((item.unit_price - cost) * activeQty);
                  }, 0);
                  
                  return (
                    <>
                      {totalDiscount > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span>Line Discount (Total)</span>
                          <span className="font-medium text-green-600">${totalDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span>Line Total (Total)</span>
                        <span className="font-semibold">${Number(cart.total).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Line Profit (Total)</span>
                        <span className={`font-semibold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${totalProfit.toFixed(2)}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {items.length === 0 && (
              <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                No items in this sale.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
