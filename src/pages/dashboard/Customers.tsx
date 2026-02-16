import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Shield, ShieldOff, Search } from "lucide-react";
import { withLoading, handleError, handleSuccess } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { filterCustomers } from "@/lib/filters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  is_admin?: boolean;
  cart_count?: number;
}

export default function Customers() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [promoteTarget, setPromoteTarget] = useState<Customer | null>(null);
  const [demoteTarget, setDemoteTarget] = useState<Customer | null>(null);

  const load = async () => {
    await withLoading(setLoading, async () => {
      const { data: custs } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      const { data: admins } = await supabase.from("admins").select("id");
      const { data: carts } = await supabase.from("carts").select("customer_id");
      const adminIds = new Set((admins || []).map((a) => a.id));
      const cartCounts: Record<string, number> = {};
      (carts || []).forEach((c) => { cartCounts[c.customer_id] = (cartCounts[c.customer_id] || 0) + 1; });
      setCustomers((custs || []).map((c) => ({ ...c, is_admin: adminIds.has(c.id), cart_count: cartCounts[c.id] || 0 })));
    });
  };

  useEffect(() => { load(); }, []);

  const handlePromote = async () => {
    if (!promoteTarget) return;
    const { error } = await supabase.from("admins").insert({ id: promoteTarget.id });
    if (error) handleError(error); else { handleSuccess(`${promoteTarget.full_name} promoted to admin`); load(); }
    setPromoteTarget(null);
  };

  const handleDemote = async () => {
    if (!demoteTarget) return;
    const { error } = await supabase.from("admins").delete().eq("id", demoteTarget.id);
    if (error) handleError(error); else { handleSuccess(`${demoteTarget.full_name} demoted from admin`); load(); }
    setDemoteTarget(null);
  };

  const filtered = filterCustomers(customers, search);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <LoadingGrid count={6} columns={3} />
        ) : filtered.length > 0 ? (
          filtered.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{c.full_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">{c.email}</div>
                <div className="flex items-center justify-between text-sm">
                  <div>{c.phone || "—"}</div>
                  <div>{c.is_admin ? <Badge>Admin</Badge> : <Badge variant="secondary">Customer</Badge>}</div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">Orders: {c.cart_count}</div>
                  <div className="text-muted-foreground">{formatDate(c.created_at)}</div>
                </div>
                <div className="flex justify-end">
                  {c.is_admin ? (
                    <Button variant="ghost" size="icon" title="Demote" onClick={() => setDemoteTarget(c)}>
                      <ShieldOff className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" title="Promote to Admin" onClick={() => setPromoteTarget(c)}>
                      <Shield className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <EmptyState message="No customers found" />
        )}
      </div>

      <AlertDialog open={!!promoteTarget} onOpenChange={() => setPromoteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Admin?</AlertDialogTitle>
            <AlertDialogDescription>{promoteTarget?.full_name} will gain admin access to the dashboard.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromote}>Promote</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!demoteTarget} onOpenChange={() => setDemoteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Demote from Admin?</AlertDialogTitle>
            <AlertDialogDescription>{demoteTarget?.full_name} will lose admin access.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDemote}>Demote</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
