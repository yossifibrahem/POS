import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SalesHistory() {
  const navigate = useNavigate();
  const [carts, setCarts] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async () => {
    let query = supabase.from("carts").select("*, customers(full_name), sold_products(quantity)").order("created_at", { ascending: false });
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");
    const { data } = await query;
    setCarts(data || []);
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carts.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/dashboard/sales/${c.id}`)}>
                <TableCell>{new Date(c.created_at).toLocaleString()}</TableCell>
                <TableCell>{(c.customers as any)?.full_name || "Unknown"}</TableCell>
                <TableCell className="text-right">{(c.sold_products as any[])?.length || 0}</TableCell>
                <TableCell className="text-right font-semibold">${Number(c.total).toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {carts.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No sales found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
