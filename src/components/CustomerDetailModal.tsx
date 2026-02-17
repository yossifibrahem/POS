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
}

interface CustomerDetailModalProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerDetailModal({ customer, open, onOpenChange }: CustomerDetailModalProps) {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [showOnlyCompleted, setShowOnlyCompleted] = useState(true);

  const loadCarts = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    let query = supabase
      .from("carts")
      .select("*, sold_products(quantity, products(name))")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    if (showOnlyCompleted) {
      query = query.eq("status", "completed");
    }
    const { data } = await query;
    setCarts(data || []);
    setLoading(false);
  }, [customer, showOnlyCompleted]);

  useEffect(() => {
    if (open && customer) {
      loadCarts();
    }
  }, [open, customer, loadCarts, showOnlyCompleted]);

  const handleCartClick = (cartId: string) => {
    setSelectedCartId(cartId);
    setCartModalOpen(true);
  };

  if (!customer) return null;

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
                  {customer.is_admin ? (
                    <Badge>Admin</Badge>
                  ) : (
                    <Badge variant="secondary">Customer</Badge>
                  )}
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

              {/* Carts Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  <h3 className="font-semibold">Purchase History</h3>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-sm text-muted-foreground">Show only completed</span>
                    <Switch
                      checked={showOnlyCompleted}
                      onCheckedChange={setShowOnlyCompleted}
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading carts...
                  </div>
                ) : carts.length > 0 ? (
                  <div className="grid gap-3">
                    {carts.map((cart) => (
                      <Card 
                        key={cart.id} 
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleCartClick(cart.id)}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">
                              {formatDateTime(cart.created_at)}
                            </CardTitle>
                            <Badge 
                              variant={cart.status === 'completed' ? 'default' : 
                                      cart.status === 'refunded' ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              {cart.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Items: {cart.sold_products?.length || 0}
                            </span>
                            <span className="font-semibold">
                              {formatCurrency(Number(cart.total))}
                            </span>
                          </div>
                          {cart.sold_products && cart.sold_products.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {cart.sold_products.slice(0, 3).map((sp, idx) => (
                                <span 
                                  key={idx} 
                                  className="text-xs bg-muted px-2 py-1 rounded"
                                >
                                  {sp.products?.name || "Unknown"} ({sp.quantity})
                                </span>
                              ))}
                              {cart.sold_products.length > 3 && (
                                <span className="text-xs text-muted-foreground px-1">
                                  +{cart.sold_products.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                    No purchase history found.
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <CartDetailModal
        cartId={selectedCartId}
        open={cartModalOpen}
        onOpenChange={setCartModalOpen}
      />
    </>
  );
}
