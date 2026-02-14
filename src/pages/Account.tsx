import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

export default function Account() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [carts, setCarts] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("customers").select("*").eq("id", user.id).single().then(({ data }) => setCustomer(data));
    supabase.from("carts").select("*, sold_products(quantity)").eq("customer_id", user.id).order("created_at", { ascending: false }).then(({ data }) => setCarts(data || []));
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
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
              <div className="space-y-2">
                {carts.map((cart) => (
                  <div key={cart.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{new Date(cart.created_at).toLocaleDateString()}</p>
                      <p className="text-muted-foreground">{cart.sold_products?.length || 0} items</p>
                    </div>
                    <p className="font-semibold">${Number(cart.total).toFixed(2)}</p>
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
