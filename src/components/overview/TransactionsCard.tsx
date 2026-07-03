import { Package, ShoppingCart, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { formatOverviewDate, type Cart, type CartLineItem } from "@/lib/overview";

interface TransactionsCardProps {
  carts: Cart[];
  loading: boolean;
  selectedDate: Date;
  onSelectCart: (cartId: string) => void;
}

export function TransactionsCard({ carts, loading, selectedDate, onSelectCart }: TransactionsCardProps) {
  return (
    <Card className="overflow-hidden border-muted/60">
      <CardHeader className="pb-3 border-b shrink-0 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Transactions</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs bg-muted">
            {carts.length} orders
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 max-h-[500px] overflow-y-auto">
        {loading ? (
          <TransactionSkeleton />
        ) : carts.length === 0 ? (
          <EmptyTransactions selectedDate={selectedDate} />
        ) : (
          <div className="divide-y divide-muted/50">
            {carts.map((cart) => (
              <TransactionRow key={cart.id} cart={cart} onSelectCart={onSelectCart} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex items-center justify-between p-3 rounded-lg border">
          <div className="space-y-1">
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="h-3 w-20 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-4 w-16 bg-muted rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function EmptyTransactions({ selectedDate }: { selectedDate: Date }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mb-4">
        <div className="p-4 bg-muted rounded-full">
          <ShoppingCart className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="absolute -bottom-1 -right-1 p-1.5 bg-background rounded-full border">
          <XCircle className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">No transactions yet</p>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-[200px]">
        No sales recorded for {formatOverviewDate(selectedDate).toLowerCase()}
      </p>
    </div>
  );
}

function TransactionRow({ cart, onSelectCart }: { cart: Cart; onSelectCart: (cartId: string) => void }) {
  const totalItems = cart.line_items?.reduce((sum, item) => sum + activeQuantity(item), 0) || 0;
  const isRefunded = cart.refund_status === "fully_refunded";
  const isPartialRefund = cart.refund_status === "partially_refunded";

  return (
    <div className="group p-4 hover:bg-muted/40 transition-all duration-200 cursor-pointer" onClick={() => onSelectCart(cart.id)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary">
              {(cart.processed_by_name || "U").charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[140px]">
              {cart.processed_by_name || "Unknown"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {cart.customer_name || "Walk-in"} &middot; {formatRelativeTime(cart.created_at)}
            </p>
          </div>
        </div>
        <p className={`text-lg font-bold shrink-0 ml-3 ${isRefunded ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {formatCurrency(Number(cart.net_amount ?? cart.total))}
        </p>
      </div>

      <div className="pt-2 border-t border-muted/30">
        <div className="flex items-center gap-1.5 mb-2">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {totalItems} {totalItems === 1 ? "item" : "items"}
          </span>
          {(isRefunded || isPartialRefund) && (
            <Badge variant={isRefunded ? "destructive" : "secondary"} className="text-[10px] h-5 px-2 ml-auto">
              {isRefunded ? "Refunded" : "Partial Refund"}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cart.line_items?.slice(0, 4).map((item, index) => (
            <ProductChip key={`${item.product_name}-${index}`} item={item} />
          ))}
          {!!cart.line_items && cart.line_items.length > 4 && (
            <span className="inline-flex items-center text-xs text-muted-foreground px-2 py-1">
              +{cart.line_items.length - 4} more
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductChip({ item }: { item: CartLineItem }) {
  const soldQty = item.sold_quantity || 0;
  const refundedQty = item.refunded_quantity || 0;
  const activeQty = soldQty - refundedQty;
  const isItemRefunded = refundedQty >= soldQty;
  const isPartiallyRefunded = refundedQty > 0 && refundedQty < soldQty;
  const productName = item.product_name?.split(" - ")[0] || "Unknown";

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${chipClass(isItemRefunded, isPartiallyRefunded)}`}>
      {isPartiallyRefunded ? (
        <span className="font-medium text-[10px] bg-muted text-muted-foreground px-1 rounded">
          {activeQty}/{soldQty}
        </span>
      ) : (
        !isItemRefunded && (
          <span className="font-medium text-[10px] bg-primary/10 text-primary px-1 rounded">
            {activeQty}
          </span>
        )
      )}
      <span className={`truncate ${isPartiallyRefunded ? "max-w-[80px]" : "max-w-[100px]"}`}>
        {productName}
      </span>
    </span>
  );
}

function activeQuantity(item: CartLineItem): number {
  return (item.sold_quantity || 0) - (item.refunded_quantity || 0);
}

function chipClass(isRefunded: boolean, isPartial: boolean): string {
  if (isRefunded) return "bg-muted/50 text-muted-foreground line-through decoration-muted-foreground/50";
  if (isPartial) return "bg-muted/30 border-muted text-muted-foreground";
  return "bg-background text-foreground border-muted";
}
