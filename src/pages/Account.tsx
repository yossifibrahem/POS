import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";

type CartItem = {
  id: string;
  quantity: number;
  unit_price: number;
  products?: {
    name: string;
  };
};

type Customer = {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
};

type Cart = {
  id: string;
  total: number;
  created_at: string;
  notes?: string;
  sold_products: CartItem[];
};

export default function Account() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [expandedCart, setExpandedCart] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("customers").select("*").eq("id", user.id).single().then(({ data }) => setCustomer(data));
    supabase
      .from("carts")
      .select("*, sold_products(*, products(name))")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCarts(data || []));
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const toggleExpand = (cartId: string) => {
    setExpandedCart(expandedCart === cartId ? null : cartId);
  };

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Account</h1>
          <Button variant="outline" onClick={handleSignOut}>Sign Out</Button>
        </div>

        {customer && (
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="font-medium">Name:</span> {customer.full_name}</p>
              <p><span className="font-medium">Email:</span> {customer.email}</p>
              <p><span className="font-medium">Phone:</span> {customer.phone || "—"}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Purchase History</CardTitle></CardHeader>
          <CardContent>
            {carts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases yet.</p>
            ) : (
              <div className="space-y-3">
                {carts.map((cart) => (
                  <div key={cart.id} className="rounded-md border">
                    <div 
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleExpand(cart.id)}
                    >
                      <div>
                        <p className="font-medium">{new Date(cart.created_at).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">{cart.sold_products?.length || 0} items</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">${Number(cart.total).toFixed(2)}</p>
                        {expandedCart === cart.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    
                    {expandedCart === cart.id && cart.sold_products && cart.sold_products.length > 0 && (
                      <div className="border-t p-3 bg-muted/20">
                        <div className="space-y-2">
                          {cart.sold_products.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-sm">
                              <div className="flex-1">
                                <p className="font-medium">{item.products?.name || "Unknown Product"}</p>
                                <p className="text-muted-foreground text-xs">
                                  ${Number(item.unit_price).toFixed(2)} x {item.quantity}
                                </p>
                              </div>
                              <p className="font-semibold">${(Number(item.unit_price) * item.quantity).toFixed(2)}</p>
                            </div>
                          ))}
                          {cart.notes && (
                            <div className="pt-2 border-t text-sm">
                              <p><span className="font-medium">Notes:</span> {cart.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
