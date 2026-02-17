import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Phone, Calendar, ShoppingCart } from "lucide-react";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/formatters";
import { CartDetailModal } from "./CartDetailModal";

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  is_admin?: boolean;
}

interface Cart {
  id: string;
  total: number;
  created_at: string;
  status: string;
  sold_products?: { quantity: number; products?: { name?: string } }[];
  customers?: { full_name?: string };
}

interface CustomerDetailModalProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CartCard({ cart, showCustomer, onClick }: { cart: Cart; showCustomer?: boolean; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={onClick}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{formatDateTime(cart.created_at)}</CardTitle>
          <Badge 
            variant={cart.status === 'completed' ? 'default' : cart.status === 'refunded' ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            {cart.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {showCustomer && (
          <div className="text-sm text-muted-foreground mb-2">
            Customer: {cart.customers?.full_name || "Walk-in Customer"}
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Items: {cart.sold_products?.length || 0}</span>
          <span className="font-semibold">{formatCurrency(Number(cart.total))}</span>
        </div>
        {cart.sold_products && cart.sold_products.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {cart.sold_products.slice(0, 3).map((sp, idx) => (
              <span key={idx} className="text-xs bg-muted px-2 py-1 rounded">
                {sp.products?.name || "Unknown"} ({sp.quantity})
              </span>
            ))}
            {cart.sold_products.length > 3 && (
              <span className="text-xs text-muted-foreground px-1">+{cart.sold_products.length - 3} more</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CustomerDetailModal({ customer, open, onOpenChange }: CustomerDetailModalProps) {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [showOnlyCompleted, setShowOnlyCompleted] = useState(true);
  const [processedCarts, setProcessedCarts] = useState<Cart[]>([]);
  const [loadingProcessed, setLoadingProcessed] = useState(false);
  const [activeTab, setActiveTab] = useState<"purchases" | "processed">("purchases");

  const loadCarts = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    let query = supabase
      .from("carts")
      .select("*, sold_products(quantity, products(name))")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    if (showOnlyCompleted) query = query.eq("status", "completed");
    const { data } = await query;
    setCarts(data || []);
    setLoading(false);
  }, [customer, showOnlyCompleted]);

  const loadProcessedCarts = useCallback(async () => {
    if (!customer) return;
    setLoadingProcessed(true);
    let query = supabase
      .from("carts")
      .select("*, customers(full_name), sold_products(quantity, products(name))")
      .eq("processed_by", customer.id)
      .order("created_at", { ascending: false });
    if (showOnlyCompleted) query = query.eq("status", "completed");
    const { data } = await query;
    setProcessedCarts(data || []);
    setLoadingProcessed(false);
  }, [customer, showOnlyCompleted]);

  useEffect(() => {
    if (open && customer) {
      loadCarts();
      loadProcessedCarts();
    }
  }, [open, customer, loadCarts, loadProcessedCarts, showOnlyCompleted]);

  const handleCartClick = (cartId: string) => {
    setSelectedCartId(cartId);
    setCartModalOpen(true);
  };

  if (!customer) return null;

  const currentCarts = activeTab === "purchases" ? carts : processedCarts;
  const currentLoading = activeTab === "purchases" ? loading : loadingProcessed;
  const showCustomer = activeTab === "processed";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[95vh] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Customer Details
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(95vh-8rem)] px-6 pb-6">
            <div className="space-y-6">
              {/* Customer Info Card */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{customer.full_name}</h3>
                  <Badge variant={customer.is_admin ? "default" : "secondary"}>
                    {customer.is_admin ? "Admin" : "Customer"}
                  </Badge>
                </div>
                <Separator />
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{customer.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{customer.phone || "No phone number"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Joined {formatDate(customer.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="flex items-center justify-center gap-4 p-1 bg-muted rounded-lg">
                <button
                  onClick={() => setActiveTab("purchases")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "purchases" 
                      ? "bg-background text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Purchase History
                </button>
                <button
                  onClick={() => setActiveTab("processed")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "processed" 
                      ? "bg-background text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Processed Sales
                </button>
              </div>

              {/* Toggle and Content */}
              <div className="space-y-3">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm text-muted-foreground">Show only completed</span>
                  <Switch checked={showOnlyCompleted} onCheckedChange={setShowOnlyCompleted} />
                </div>

                {currentLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : currentCarts.length > 0 ? (
                  <div className="grid gap-3">
                    {currentCarts.map((cart) => (
                      <CartCard 
                        key={cart.id} 
                        cart={cart} 
                        showCustomer={showCustomer} 
                        onClick={() => handleCartClick(cart.id)} 
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                    No {activeTab === "purchases" ? "purchase history" : "processed sales"} found.
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <CartDetailModal cartId={selectedCartId} open={cartModalOpen} onOpenChange={setCartModalOpen} />
    </>
  );
}
