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
import { RotateCcw, Package } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Json } from "@/integrations/supabase/types";

type CartRow = { 
  id: string; 
  total: number; 
  created_at: string; 
  notes?: string | null; 
  customers?: { full_name?: string; email?: string }; 
  admins?: { id?: string; full_name?: string } 
};

type SoldItemRow = { 
  sold_product_id: string; 
  product_id: string; 
  sold_quantity: number; 
  refunded_quantity: number;
  unit_price: number; 
  line_total: number;
  net_line_total: number;
  product_name: string | null;
  product_attributes: Json | null;
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
      supabase.from("carts").select("*, customers(full_name, email), admins(full_name)").eq("id", cartId).single(),
      // Use cart_line_items view for line items with refund info
      supabase.from("cart_line_items").select("*").eq("cart_id", cartId),
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
    const qty = returnQty[item.sold_product_id] ?? 1;
    const newRefundedQty = currentRefunded + qty;
    if (qty < 1 || newRefundedQty > item.sold_quantity) return;
    setReturningId(item.sold_product_id);
    try {
      // Step 1: Insert into refunds table
      const refundAmount = qty * item.unit_price;
      const { data: refundData, error: refundError } = await supabase
        .from("refunds")
        .insert({
          cart_id: cartId,
          refund_amount: refundAmount
        })
        .select()
        .single();

      if (refundError) throw refundError;
      if (!refundData) throw new Error("Failed to create refund record");

      // Step 2: Insert into refund_items
      const { error: itemError } = await supabase
        .from("refund_items")
        .insert({
          refund_id: refundData.id,
          sold_product_id: item.sold_product_id,
          quantity: qty,
          unit_price: item.unit_price
        });

      if (itemError) throw itemError;

      if (onRefund) {
        onRefund();
      }

      setReturnQty((prev) => {
        const next = { ...prev };
        delete next[item.sold_product_id];
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
                <p><span className="font-medium">Processed by:</span> {cart.admins?.full_name || "Unknown"}</p>
                <p><span className="font-medium">Date:</span> {new Date(cart.created_at).toLocaleString()}</p>
                <p><span className="font-medium">Total:</span> ${Number(cart.total).toFixed(2)}</p>
                {cart.notes && <p className="sm:col-span-2"><span className="font-medium">Notes:</span> {cart.notes}</p>}
              </div>
            </div>

            {/* Items List */}
            {items.length > 0 && (
              <div className="grid gap-4 grid-cols-1">
                {items.map((item) => {
                  const attributes = getAttributes(item.product_attributes);
                  const hasAttributes = Object.keys(attributes).length > 0;
                  const refundedQty = item.refunded_quantity || 0;
                  const isFullyRefunded = refundedQty >= item.sold_quantity;
                  const isPartiallyRefunded = refundedQty > 0 && !isFullyRefunded;
                  const activeQuantity = item.sold_quantity - refundedQty;
                  const activeSubtotal = activeQuantity * Number(item.unit_price);
                  const refundedSubtotal = refundedQty * Number(item.unit_price);
                  
                  return (
                    <div key={item.sold_product_id} className={`rounded-lg border bg-card p-4 ${isFullyRefunded ? 'opacity-60 bg-red-50' : ''}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          {item.product_name}
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
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Sold Qty</span>
                          <span className="font-medium">{item.sold_quantity}</span>
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
                          <span className="font-medium">${Number(item.unit_price).toFixed(2)}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex items-center justify-between text-sm">
                          <span>Line Total</span>
                          <span className={`font-semibold ${isFullyRefunded ? 'line-through' : ''}`}>${activeSubtotal.toFixed(2)}</span>
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
                              value={String(returnQty[item.sold_product_id] ?? 1)}
                              onValueChange={(v) => setReturnQty((p) => ({ ...p, [item.sold_product_id]: parseInt(v, 10) }))}
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
                              disabled={returningId === item.sold_product_id}
                            >
                              {returningId === item.sold_product_id ? "..." : <><RotateCcw className="h-3 w-3" /> Return</>}
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
                <div className="flex items-center justify-between text-sm">
                  <span>Total</span>
                  <span className="font-semibold">${Number(cart.total).toFixed(2)}</span>
                </div>
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
