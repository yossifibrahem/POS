import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw, Package, TrendingUp, Tag } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/formatters";

type CartRow = { 
  id: string; total: number; created_at: string; notes?: string | null; 
  customers?: { profiles?: { full_name?: string; email?: string } | null }; 
  admins?: { profiles?: { full_name?: string } | null } 
};

type SoldItemRow = { 
  sold_product_id: string; product_id: string; sold_quantity: number; 
  refunded_quantity: number; unit_price: number; line_total: number;
  net_line_total: number; product_name: string | null; product_attributes: Json | null;
  product_cost: number | null; original_price: number | null;
};

interface CartDetailModalProps {
  cartId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onRefund?: () => void;
}

export function CartDetailModal({ cartId, open, onOpenChange, onRefund }: CartDetailModalProps) {
  const { user } = useAuth();
  const [cart, setCart] = useState<CartRow | null>(null);
  const [items, setItems] = useState<SoldItemRow[]>([]);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    if (!cartId) return;
    const [cartRes, itemsRes] = await Promise.all([
      supabase.from("carts").select("*, customers(profiles(full_name, email)), admins(profiles(full_name))").eq("id", cartId).single(),
      supabase.from("cart_line_items").select("*").eq("cart_id", cartId),
    ]);
    if (cartRes.data) setCart(cartRes.data);
    
    const lineItems = itemsRes.data || [];
    const productIds = [...new Set(lineItems.map(i => i.product_id).filter(Boolean))];
    
    let productData: Record<string, { cost: number | null; price: number | null }> = {};
    if (productIds.length > 0) {
      const { data: products } = await supabase.from("products").select("id, cost, price").in("id", productIds);
      productData = Object.fromEntries((products || []).map(p => [p.id, { cost: p.cost, price: p.price }]));
    }
    
    setItems(lineItems.map(item => ({
      sold_product_id: item.sold_product_id!, product_id: item.product_id!,
      sold_quantity: item.sold_quantity ?? 0, refunded_quantity: item.refunded_quantity ?? 0,
      unit_price: item.unit_price ?? 0, line_total: item.line_total ?? 0,
      net_line_total: item.net_line_total ?? 0, product_name: item.product_name,
      product_attributes: item.product_attributes,
      product_cost: productData[item.product_id!]?.cost ?? null,
      original_price: productData[item.product_id!]?.price ?? null,
    })));
  }, [cartId]);

  useEffect(() => {
    if (!open || !cartId) { setCart(null); setItems([]); setReturnQty({}); }
  }, [open, cartId]);

  useEffect(() => { if (open && cartId) loadData(); }, [open, cartId, loadData]);

  const handlePartialReturn = async (item: SoldItemRow) => {
    const qty = returnQty[item.sold_product_id] ?? 1;
    const newRefunded = (item.refunded_quantity || 0) + qty;
    if (qty < 1 || newRefunded > item.sold_quantity) return;
    setReturningId(item.sold_product_id);
    try {
      const refundAmount = qty * item.unit_price;
      const { data: refundData, error: refundError } = await supabase.from("refunds").insert({
        cart_id: cartId, refund_amount: refundAmount, processed_by: user?.id
      }).select().single();
      if (refundError) throw refundError;
      if (!refundData) throw new Error("Failed to create refund record");

      const { error: itemError } = await supabase.from("refund_items").insert({
        refund_id: refundData.id, sold_product_id: item.sold_product_id, quantity: qty, unit_price: item.unit_price
      });
      if (itemError) throw itemError;

      if (onRefund) onRefund();
      setReturnQty(prev => { const next = { ...prev }; delete next[item.sold_product_id]; return next; });
      await loadData();
      toast.success(`Returned ${qty} unit(s). Stock restored.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Return failed");
    } finally {
      setReturningId(null);
    }
  };

  const getAttributes = (attrs: Json | undefined): Record<string, string | number | boolean> => {
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return {};
    return attrs as Record<string, string | number | boolean>;
  };

  const calcItemMetrics = (item: SoldItemRow) => {
    const activeQty = item.sold_quantity - (item.refunded_quantity || 0);
    const unitPrice = Number(item.unit_price);
    const discount = item.original_price && item.original_price > unitPrice ? (item.original_price - unitPrice) * activeQty : 0;
    const profit = item.product_cost !== null ? (unitPrice - item.product_cost) * activeQty : null;
    return { activeQty, discount, profit, subtotal: activeQty * unitPrice };
  };

  const calcCartTotals = () => ({
    discount: items.reduce((sum, item) => {
      const activeQty = item.sold_quantity - (item.refunded_quantity || 0);
      const discountPerUnit = item.original_price && item.original_price > Number(item.unit_price) 
        ? item.original_price - Number(item.unit_price) : 0;
      return sum + discountPerUnit * activeQty;
    }, 0),
    profit: items.reduce((sum, item) => {
      const activeQty = item.sold_quantity - (item.refunded_quantity || 0);
      return sum + (item.product_cost !== null ? (Number(item.unit_price) - item.product_cost) * activeQty : 0);
    }, 0),
    netTotal: items.reduce((sum, item) => {
      const activeQty = item.sold_quantity - (item.refunded_quantity || 0);
      return sum + Number(item.unit_price) * activeQty;
    }, 0)
  });

  if (!cart) return null;

  const { discount: totalDiscount, profit: totalProfit, netTotal } = calcCartTotals();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Sale Details</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-8rem)] px-6 pb-6">
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="font-medium">Customer:</span> {cart.customers?.profiles?.full_name || "Walk-in Customer"}</p>
                <p><span className="font-medium">Processed by:</span> {cart.admins?.profiles?.full_name || "Unknown"}</p>
                <p><span className="font-medium">Date:</span> {new Date(cart.created_at).toLocaleString()}</p>
                <p><span className="font-medium">Total:</span> {formatCurrency(netTotal)}</p>
                {cart.notes && <p className="sm:col-span-2"><span className="font-medium">Notes:</span> {cart.notes}</p>}
              </div>
            </div>

            {items.length > 0 && (
              <div className="grid gap-4 grid-cols-1">
                {items.map(item => {
                  const attrs = getAttributes(item.product_attributes);
                  const hasAttrs = Object.keys(attrs).length > 0;
                  const refundedQty = item.refunded_quantity || 0;
                  const isFullyRefunded = refundedQty >= item.sold_quantity;
                  const isPartiallyRefunded = refundedQty > 0 && !isFullyRefunded;
                  const { activeQty, discount, profit, subtotal } = calcItemMetrics(item);

                  return (
                    <div key={item.sold_product_id} className={`rounded-lg border bg-card p-4 ${isFullyRefunded ? 'opacity-60 bg-red-50' : ''}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          {item.product_name}
                        </div>
                        <div className="flex items-center gap-2">
                          {isFullyRefunded && <Badge variant="destructive" className="text-xs">Refunded</Badge>}
                          {isPartiallyRefunded && <Badge variant="outline" className="text-xs bg-yellow-50">Partial Refund</Badge>}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span>Sold Qty</span><span className="font-medium">{item.sold_quantity}</span></div>
                        {isPartiallyRefunded && <div className="flex justify-between text-sm text-muted-foreground"><span>Refunded</span><span className="line-through">-{refundedQty}</span></div>}
                        {isPartiallyRefunded && <div className="flex justify-between text-sm"><span>Active Qty</span><span className="font-medium">{activeQty}</span></div>}
                        <div className="flex justify-between text-sm"><span>Unit Price</span><span className="font-medium">{formatCurrency(Number(item.unit_price))}</span></div>
                        
                        {discount > 0 && (
                          <div className="flex justify-between text-sm text-green-600">
                            <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Discount</span>
                            <span className="font-medium">-{formatCurrency(discount)}</span>
                          </div>
                        )}
                        
                        {profit !== null && (
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Profit</span>
                            <span className={`font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(profit)}</span>
                          </div>
                        )}
                        
                        <Separator className="my-2" />
                        <div className="flex justify-between text-sm">
                          <span>Line Total</span>
                          <span className={`font-semibold ${isFullyRefunded ? 'line-through' : ''}`}>{formatCurrency(subtotal)}</span>
                        </div>
                        
                        {hasAttrs && (
                          <>
                            <Separator className="my-2" />
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Product Attributes</div>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(attrs).map(([key, value]) => (
                                  <div key={key} className="flex flex-col">
                                    <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                                    <span className="text-sm font-medium">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {!isFullyRefunded && activeQty > 0 && (
                          <div className="flex items-center justify-between gap-2 pt-2 border-t">
                            <Select value={String(returnQty[item.sold_product_id] ?? 1)} onValueChange={v => setReturnQty(p => ({ ...p, [item.sold_product_id]: parseInt(v, 10) }))}>
                              <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: activeQty }, (_, i) => i + 1).map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" className="gap-1 h-8 text-red-500 hover:text-red-600" onClick={() => handlePartialReturn(item)} disabled={returningId === item.sold_product_id}>
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

            {items.length > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-2 mt-4">
                <div className="text-sm font-semibold mb-3">Cart Summary</div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Total Discount</span>
                    <span className="font-semibold">-{formatCurrency(totalDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Profit</span>
                  <span className={`font-semibold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalProfit)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-sm"><span>Total</span><span className="font-semibold">{formatCurrency(netTotal)}</span></div>
              </div>
            )}

            {items.length === 0 && (
              <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">No items in this sale.</div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
