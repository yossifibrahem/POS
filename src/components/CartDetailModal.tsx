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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/formatters";
import { canSeeCostAndProfit } from "@/lib/permissions";

type CartRow = { 
  id: string; total: number; created_at: string; notes?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  processed_by_name?: string | null;
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

const Row = ({ label, value, className = "", icon: Icon }: { label: string; value: string | number; className?: string; icon?: React.ComponentType<{ className?: string }> }) => (
  <div className={`flex justify-between text-sm ${className}`}>
    <span className="flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />}{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

export function CartDetailModal({ cartId, open, onOpenChange, onRefund }: CartDetailModalProps) {
  const { user, adminLevel } = useAuth();
  const [cart, setCart] = useState<CartRow | null>(null);
  const [items, setItems] = useState<SoldItemRow[]>([]);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [pendingRefundItem, setPendingRefundItem] = useState<SoldItemRow | null>(null);

  const loadData = useCallback(async () => {
    if (!cartId) return;
    const [cartRes, itemsRes] = await Promise.all([
      supabase.from("cart_summary").select("*").eq("id", cartId).single(),
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
    if (!open || !cartId) { setCart(null); setItems([]); setReturnQty({}); setPendingRefundItem(null); }
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

  const calcMetrics = (item: SoldItemRow) => {
    const activeQty = item.sold_quantity - (item.refunded_quantity || 0);
    const unitPrice = Number(item.unit_price);
    const originalPrice = item.original_price || unitPrice;
    const unitDiscount = Math.max(0, originalPrice - unitPrice);
    const unitProfit = item.product_cost !== null ? unitPrice - item.product_cost : null;
    
    return {
      activeQty,
      unitDiscount,
      totalDiscount: unitDiscount * activeQty,
      totalOriginalPrice: originalPrice * activeQty,
      subtotal: activeQty * unitPrice,
      unitProfit,
      lineProfit: unitProfit !== null ? unitProfit * activeQty : null,
      hasDiscount: unitDiscount > 0
    };
  };

  const calcCartTotals = () => items.reduce((acc, item) => {
    const m = calcMetrics(item);
    return {
      discount: acc.discount + m.totalDiscount,
      profit: acc.profit + (m.lineProfit || 0),
      netTotal: acc.netTotal + m.subtotal
    };
  }, { discount: 0, profit: 0, netTotal: 0 });

  if (!cart) return null;

  const { discount: totalDiscount, profit: totalProfit, netTotal } = calcCartTotals();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] p-0" aria-describedby={undefined}>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Sale Details</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-8rem)] px-6 pb-6">
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="font-medium">Customer:</span> {cart.customer_name || "Walk-in Customer"}</p>
                <p><span className="font-medium">Processed by:</span> {cart.processed_by_name || "Unknown"}</p>
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
                  const m = calcMetrics(item);

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
                        <Row label="Sold Qty" value={item.sold_quantity} />
                        {isPartiallyRefunded && <Row label="Refunded" value={`-${refundedQty}`} className="text-muted-foreground" />}
                        {isPartiallyRefunded && <Row label="Active Qty" value={m.activeQty} />}

                        {m.hasDiscount && <Row label="Original Unit Price" value={formatCurrency(item.original_price!)} className="text-muted-foreground" />}
                        {m.hasDiscount && <Row label="Unit Discount" value={`-${formatCurrency(m.unitDiscount)}`} className="text-green-600" icon={Tag} />}
                        <Row label="Unit Price" value={formatCurrency(Number(item.unit_price))} />

                        <Separator className="my-2" />

                        {m.hasDiscount && <Row label="Total Original Price" value={formatCurrency(m.totalOriginalPrice)} className="text-muted-foreground" />}
                        {m.hasDiscount && <Row label="Total Discount" value={`-${formatCurrency(m.totalDiscount)}`} className="text-green-600" icon={Tag} />}
                        <Row label="Line Total" value={formatCurrency(m.subtotal)} className={isFullyRefunded ? 'line-through' : ''} />

                        <Separator className="my-2" />

                        {canSeeCostAndProfit(adminLevel) && m.unitProfit !== null && <Row label="Unit Profit" value={formatCurrency(m.unitProfit)} className={m.unitProfit >= 0 ? 'text-green-600' : 'text-red-600'} icon={TrendingUp} />}
                        {canSeeCostAndProfit(adminLevel) && m.lineProfit !== null && <Row label="Line Profit" value={formatCurrency(m.lineProfit)} className={m.lineProfit >= 0 ? 'text-green-600' : 'text-red-600'} icon={TrendingUp} />}
                        
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

                        {!isFullyRefunded && m.activeQty > 0 && (
                          <div className="flex items-center justify-between gap-2 pt-2 border-t">
                            <Select value={String(returnQty[item.sold_product_id] ?? 1)} onValueChange={v => setReturnQty(p => ({ ...p, [item.sold_product_id]: parseInt(v, 10) }))}>
                              <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: m.activeQty }, (_, i) => i + 1).map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" className="gap-1 h-8 text-red-500 hover:text-red-600" onClick={() => setPendingRefundItem(item)} disabled={returningId === item.sold_product_id}>
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
                {totalDiscount > 0 && <Row label="Total Discount" value={`-${formatCurrency(totalDiscount)}`} className="text-green-600" icon={Tag} />}
                {canSeeCostAndProfit(adminLevel) && <Row label="Total Profit" value={formatCurrency(totalProfit)} className={totalProfit >= 0 ? 'text-green-600' : 'text-red-600'} icon={TrendingUp} />}
                <Separator className="my-2" />
                <Row label="Total" value={formatCurrency(netTotal)} className="font-semibold" />
              </div>
            )}

            {items.length === 0 && (
              <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">No items in this sale.</div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
      
      {/* Refund Confirmation Dialog */}
      {pendingRefundItem && (
        <AlertDialog open={!!pendingRefundItem} onOpenChange={(open) => !open && setPendingRefundItem(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Refund</AlertDialogTitle>
              <AlertDialogDescription>
                Refund {returnQty[pendingRefundItem.sold_product_id] || 1} unit(s) of {pendingRefundItem.product_name} for {formatCurrency((returnQty[pendingRefundItem.sold_product_id] || 1) * Number(pendingRefundItem.unit_price))}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingRefundItem(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (pendingRefundItem) handlePartialReturn(pendingRefundItem); setPendingRefundItem(null); }} className="bg-red-500 hover:bg-red-600 text-white">Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  );
}
