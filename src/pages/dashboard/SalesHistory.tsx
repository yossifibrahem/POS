import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SalesHistory() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [carts, setCarts] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteCartId, setDeleteCartId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    let query = supabase.from("carts").select("*, customers(full_name), admins(customers:customers(full_name)), sold_products(quantity)").order("created_at", { ascending: false });
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");
    const { data } = await query;
    setCarts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const handleDeleteCart = async () => {
    if (!deleteCartId) return;
    setProcessing(true);
    try {
      // Fetch all sold_products for this cart
      const { data: soldItems, error: fetchError } = await supabase
        .from("sold_products")
        .select("*, products(stock)")
        .eq("cart_id", deleteCartId);
      
      if (fetchError) throw fetchError;

      // Restore stock for each item
      for (const item of soldItems || []) {
        const currentStock = item.products?.stock ?? 0;
        const { error: stockError } = await supabase
          .from("products")
          .update({ stock: currentStock + item.quantity })
          .eq("id", item.product_id);
        
        if (stockError) throw stockError;
      }

      // Delete all sold_products
      const { error: deleteSoldError } = await supabase
        .from("sold_products")
        .delete()
        .eq("cart_id", deleteCartId);
      
      if (deleteSoldError) throw deleteSoldError;

      // Delete the cart
      const { error: deleteCartError } = await supabase
        .from("carts")
        .delete()
        .eq("id", deleteCartId);
      
      if (deleteCartError) throw deleteCartError;

      toast.success("Cart deleted successfully. Stock has been restored.");
      setDeleteCartId(null);
      load(); // Refresh the list
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sales History</h1>

      <div className="flex gap-4">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1">
        {loading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="w-full">
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        ) : carts.length > 0 ? (
          carts.map((c) => (
            <Card key={c.id} className="cursor-pointer w-full" onClick={() => navigate(`/dashboard/sales/${c.id}`)}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{new Date(c.created_at).toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
                  <span>{(c.customers as any)?.full_name || "Unknown"}</span>
                  <span className="hidden sm:inline">•</span>
                  <span>Processed by: {((c.admins as any)?.customers as any)?.full_name || "Unknown"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Items: {(c.sold_products as any[])?.length || 0}</div>
                  <div className="font-semibold">${Number(c.total).toFixed(2)}</div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-red-500 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteCartId(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center text-muted-foreground py-8">No sales found</div>
        )}
      </div>

      <AlertDialog open={!!deleteCartId} onOpenChange={(open) => !open && setDeleteCartId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this cart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will return all products to stock and permanently delete the cart and all its items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCart}
              disabled={processing}
              className="bg-red-500 hover:bg-red-600"
            >
              {processing ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
