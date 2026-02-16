import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Trash2 } from "lucide-react";
import { withLoading, handleError, handleSuccess } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";

interface Cart {
  id: string;
  total: number;
  created_at: string;
  customers?: { full_name?: string };
  admins?: { customers?: { full_name?: string } };
  sold_products?: { quantity: number }[];
}

export default function SalesHistory() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteCartId, setDeleteCartId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    await withLoading(setLoading, async () => {
      let query = supabase.from("carts").select("*, customers(full_name), admins(customers:customers(full_name)), sold_products(quantity)").order("created_at", { ascending: false });
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");
      const { data } = await query;
      setCarts(data || []);
    });
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const handleDeleteCart = async () => {
    if (!deleteCartId) return;
    setProcessing(true);
    try {
      // Delete all sold_products (database triggers will restore stock)
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

      handleSuccess("Cart deleted successfully. Stock has been restored.");
      setDeleteCartId(null);
      load(); // Refresh the list
    } catch (e: unknown) {
      handleError(e, "Delete failed");
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
          <LoadingGrid count={4} columns={1} />
        ) : carts.length > 0 ? (
          carts.map((c) => (
            <Card key={c.id} className="cursor-pointer w-full" onClick={() => navigate(`/dashboard/sales/${c.id}`)}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{formatDateTime(c.created_at)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
                  <span>{c.customers?.full_name || "Unknown"}</span>
                  <span className="hidden sm:inline">•</span>
                  <span>Processed by: {c.admins?.customers?.full_name || "Unknown"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Items: {c.sold_products?.length || 0}</div>
                  <div className="font-semibold">{formatCurrency(Number(c.total))}</div>
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
          <EmptyState message="No sales found" />
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
