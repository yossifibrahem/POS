import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";

export default function CartDetail() {
  const { cartId } = useParams();
  const navigate = useNavigate();
  const [cart, setCart] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!cartId) return;
    supabase.from("carts").select("*, customers(full_name, email)").eq("id", cartId).single().then(({ data }) => setCart(data));
    supabase.from("sold_products").select("*, products(name)").eq("cart_id", cartId).then(({ data }) => setItems(data || []));
  }, [cartId]);

  if (!cart) return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>

      <Card>
        <CardHeader><CardTitle>Sale Details</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="font-medium">Customer:</span> {(cart.customers as any)?.full_name}</p>
          <p><span className="font-medium">Date:</span> {new Date(cart.created_at).toLocaleString()}</p>
          <p><span className="font-medium">Total:</span> ${Number(cart.total).toFixed(2)}</p>
          {cart.notes && <p className="sm:col-span-2"><span className="font-medium">Notes:</span> {cart.notes}</p>}
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{(item.products as any)?.name}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">${Number(item.unit_price).toFixed(2)}</TableCell>
                <TableCell className="text-right font-semibold">${(item.quantity * Number(item.unit_price)).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
