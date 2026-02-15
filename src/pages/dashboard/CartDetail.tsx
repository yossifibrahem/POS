import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type CartRow = { id: string; total: number; created_at: string; notes?: string | null; customers?: { full_name?: string; email?: string } };
type SoldItemRow = { id: string; product_id: string; quantity: number; unit_price: number; products?: { name?: string; stock?: number } };

export default function CartDetail() {
  const { cartId } = useParams();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartRow | null>(null);
  const [items, setItems] = useState<SoldItemRow[]>([]);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    if (!cartId) return;
    const [cartRes, itemsRes] = await Promise.all([
      supabase.from("carts").select("*, customers(full_name, email)").eq("id", cartId).single(),
      supabase.from("sold_products").select("*, products(name, stock)").eq("cart_id", cartId),
    ]);
    if (cartRes.data) setCart(cartRes.data);
    setItems(itemsRes.data || []);
  }, [cartId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePartialReturn = async (item: SoldItemRow) => {
    const qty = returnQty[item.id] ?? 1;
    if (qty < 1 || qty > item.quantity) return;
    setReturningId(item.id);
    try {
      const currentStock = item.products?.stock ?? 0;
      const { error: productError } = await supabase
        .from("products")
        .update({ stock: currentStock + qty })
        .eq("id", item.product_id);
      if (productError) throw productError;

      if (qty === item.quantity) {
        const { error: deleteError } = await supabase.from("sold_products").delete().eq("id", item.id);
        if (deleteError) throw deleteError;
      } else {
        const { error: updateError } = await supabase
          .from("sold_products")
          .update({ quantity: item.quantity - qty })
          .eq("id", item.id);
        if (updateError) throw updateError;
      }

      const remainingItems =
        qty === item.quantity
          ? items.filter((i) => i.id !== item.id)
          : items.map((i) =>
              i.id === item.id ? { ...i, quantity: i.quantity - qty } : i
            );
      const newTotal = remainingItems.reduce(
        (sum, i) => sum + i.quantity * Number(i.unit_price),
        0
      );
      const { error: cartError } = await supabase.from("carts").update({ total: newTotal }).eq("id", cartId);
      if (cartError) throw cartError;

      setReturnQty((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await loadData();
      toast.success(`Returned ${qty} unit(s). Stock restored.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Return failed");
    } finally {
      setReturningId(null);
    }
  };

  if (!cart) return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Sale Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="font-medium">Customer:</span> {cart.customers?.full_name}</p>
          <p><span className="font-medium">Date:</span> {new Date(cart.created_at).toLocaleString()}</p>
          <p><span className="font-medium">Total:</span> ${Number(cart.total).toFixed(2)}</p>
          {cart.notes && <p className="sm:col-span-2"><span className="font-medium">Notes:</span> {cart.notes}</p>}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <div className="grid gap-4 grid-cols-1">
          {items.map((item) => (
            <Card key={item.id} className="w-full">
              <CardHeader>
                <CardTitle className="text-sm font-medium">{item.products?.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Qty</span>
                  <span className="font-medium">{item.quantity}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Unit Price</span>
                  <span className="font-medium">${Number(item.unit_price).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Line Total</span>
                  <span className="font-semibold">${(item.quantity * Number(item.unit_price)).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Select
                    value={String(returnQty[item.id] ?? 1)}
                    onValueChange={(v) => setReturnQty((p) => ({ ...p, [item.id]: parseInt(v, 10) }))}
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: item.quantity }, (_, i) => i + 1).map((n) => (
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
          No items in this sale.
        </div>
      )}
    </div>
  );
}

