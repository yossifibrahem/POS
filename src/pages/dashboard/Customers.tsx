import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Shield, ShieldOff, Search } from "lucide-react";

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<Customer | null>(null);
  const [demoteTarget, setDemoteTarget] = useState<Customer | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: custs } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    const { data: admins } = await supabase.from("admins").select("id");
    const { data: carts } = await supabase.from("carts").select("customer_id");
    const adminIds = new Set((admins || []).map((a) => a.id));
    const cartCounts: Record<string, number> = {};
    (carts || []).forEach((c) => { cartCounts[c.customer_id] = (cartCounts[c.customer_id] || 0) + 1; });
    setCustomers((custs || []).map((c) => ({ ...c, is_admin: adminIds.has(c.id), cart_count: cartCounts[c.id] || 0 })));
  };

  useEffect(() => { load(); }, []);

  const handlePromote = async () => {
    if (!promoteTarget) return;
    const { error } = await supabase.from("admins").insert({ id: promoteTarget.id });
    if (error) toast.error(error.message); else { toast.success(`${promoteTarget.full_name} promoted to admin`); load(); }
    setPromoteTarget(null);
  };

  const handleDemote = async () => {
    if (!demoteTarget) return;
    const { error } = await supabase.from("admins").delete().eq("id", demoteTarget.id);
    if (error) toast.error(error.message); else { toast.success(`${demoteTarget.full_name} demoted from admin`); load(); }
    setDemoteTarget(null);
  };

  const filtered = customers.filter((c) =>
    !search || c.full_name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.full_name}</TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{c.phone || "—"}</TableCell>
                <TableCell>{c.is_admin ? <Badge>Admin</Badge> : <Badge variant="secondary">Customer</Badge>}</TableCell>
                <TableCell className="text-right">{c.cart_count}</TableCell>
                <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  {c.is_admin ? (
                    <Button variant="ghost" size="icon" title="Demote" onClick={() => setDemoteTarget(c)}>
                      <ShieldOff className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" title="Promote to Admin" onClick={() => setPromoteTarget(c)}>
                      <Shield className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No customers found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
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
