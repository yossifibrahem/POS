import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {carts.map((c) => (
          <Card key={c.id} className="cursor-pointer" onClick={() => navigate(`/dashboard/sales/${c.id}`)}>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{new Date(c.created_at).toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-muted-foreground">{(c.customers as any)?.full_name || "Unknown"}</div>
              <div className="flex items-center justify-between">
                <div className="text-sm">Items: {(c.sold_products as any[])?.length || 0}</div>
                <div className="font-semibold">${Number(c.total).toFixed(2)}</div>
              </div>
            </CardContent>
          </Card>
        ))}
        {carts.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-8">No sales found</div>
        )}
      </div>
    </div>
  );
}
