import { useCallback, useEffect, useState } from "react";
import { LogOut, Package, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSignOut } from "@/hooks/useSignOut";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingGrid } from "@/components/LoadingGrid";
import { handleError, withLoading } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/formatters";

interface Purchase {
  id: string;
  status: string | null;
  total: number | null;
  notes: string | null;
  created_at: string | null;
  refunded_amount: number | null;
  net_amount: number | null;
  refund_status: string | null;
  line_items?: PurchaseLineItem[];
}

interface PurchaseLineItem {
  cart_id: string;
  product_name: string | null;
  sold_quantity: number | null;
  refunded_quantity: number | null;
  unit_price: number | null;
  net_line_total: number | null;
}

export default function PurchaseHistory() {
  const { user } = useAuth();
  const signOut = useSignOut();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const load = useCallback(async () => {
    await withLoading(setLoading, async () => {
      const { data: purchasesData, error: purchasesError } = await supabase
        .from("cart_summary")
        .select("id, status, total, notes, created_at, refunded_amount, net_amount, refund_status")
        .order("created_at", { ascending: false });

      if (purchasesError) {
        handleError(purchasesError, "Failed to load purchase history");
        return;
      }

      if (!purchasesData?.length) {
        setPurchases([]);
        return;
      }

      const purchaseIds = purchasesData.map((purchase) => purchase.id);
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from("cart_line_items")
        .select("cart_id, product_name, sold_quantity, refunded_quantity, unit_price, net_line_total")
        .in("cart_id", purchaseIds);

      if (lineItemsError) {
        handleError(lineItemsError, "Failed to load purchase items");
        return;
      }

      const itemsByPurchase = new Map<string, PurchaseLineItem[]>();
      lineItemsData?.forEach((item) => {
        const items = itemsByPurchase.get(item.cart_id) || [];
        items.push(item);
        itemsByPurchase.set(item.cart_id, items);
      });

      setPurchases(
        purchasesData.map((purchase) => ({
          ...purchase,
          line_items: itemsByPurchase.get(purchase.id) || [],
        }))
      );
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">Purchase History</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <LoadingGrid count={4} columns={2} />
          </div>
        ) : purchases.length === 0 ? (
          <EmptyState message="No purchases found" />
        ) : (
          <div className="grid gap-4">
            {purchases.map((purchase) => (
              <Card key={purchase.id}>
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ReceiptText className="h-4 w-4 shrink-0" />
                        Receipt {purchase.id.slice(0, 8)}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {purchase.created_at ? formatDateTime(purchase.created_at) : "Date unavailable"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={purchase.status === "completed" ? "default" : "secondary"}>
                        {purchase.status || "unknown"}
                      </Badge>
                      {purchase.refund_status && purchase.refund_status !== "not_refunded" && (
                        <Badge variant="outline">{purchase.refund_status.replace("_", " ")}</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="divide-y rounded-md border bg-background">
                    {purchase.line_items?.map((item, index) => (
                      <div key={`${purchase.id}-${index}`} className="flex items-center justify-between gap-4 p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.product_name || "Product"}</p>
                            <p className="text-xs text-muted-foreground">
                              Qty {item.sold_quantity || 0}
                              {!!item.refunded_quantity && ` · Refunded ${item.refunded_quantity}`}
                            </p>
                          </div>
                        </div>
                        <p className="shrink-0 text-sm font-medium">
                          {formatCurrency(Number(item.net_line_total ?? 0))}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="text-lg font-semibold">
                      {formatCurrency(Number(purchase.net_amount ?? purchase.total ?? 0))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
