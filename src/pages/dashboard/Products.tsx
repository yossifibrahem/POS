import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { withLoading, handleError, handleSuccess, validateRequired, validateNonNegative } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { filterProducts } from "@/lib/filters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";
import { ProductDetailModal } from "@/components/ProductDetailModal";

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  category_id: string | null;
  created_at: string;
  categories?: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

export default function Products() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", price: "", cost: "", stock: "", category_id: "" });
  const [saving, setSaving] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const load = async () => {
    await withLoading(setLoading, async () => {
      const { data } = await supabase.from("products").select("*, categories(name)").order("created_at", { ascending: false });
      setProducts(data || []);
      const { data: cats } = await supabase.from("categories").select("*").order("name");
      setCategories(cats || []);
    });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", price: "", cost: "", stock: "", category_id: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, price: String(p.price), cost: String(p.cost), stock: String(p.stock), category_id: p.category_id || "" });
    setDialogOpen(true);
  };

  const openDetail = (p: Product) => {
    setDetailProduct(p);
    setDetailModalOpen(true);
  };

  const handleSave = async () => {
    if (!validateRequired(form.name, "Name")) return;
    if (!validateNonNegative(
      [Number(form.price), Number(form.cost), Number(form.stock)],
      ["Price", "Cost", "Stock"]
    )) return;
    
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      stock: parseInt(form.stock) || 0,
      category_id: form.category_id || null,
    };

    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) handleError(error); else { handleSuccess("Product updated"); setDialogOpen(false); load(); }
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) handleError(error); else { handleSuccess("Product created"); setDialogOpen(false); load(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("products").delete().eq("id", deleteId);
    if (error) {
      handleError(error, "Cannot delete: product has sales records");
    } else { handleSuccess("Product deleted"); load(); }
    setDeleteId(null);
  };

  const stockBadge = (stock: number) => {
    if (stock === 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (stock < 10) return <Badge variant="secondary">Low Stock</Badge>;
    return <Badge variant="outline">In Stock</Badge>;
  };

  const filtered = filterProducts(products, search, filterCat);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Product</Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <LoadingGrid count={6} columns={3} />
        ) : filtered.length > 0 ? (
          filtered.map((p) => (
            <Card 
              key={p.id} 
              className="cursor-pointer transition hover:shadow-md"
              onClick={() => openDetail(p)}
            >
              <CardHeader>
                <CardTitle className="text-sm font-medium">{p.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">{p.categories?.name || "—"}</div>
                <div className="flex items-center justify-between text-sm">
                  <div>{formatCurrency(p.price)}</div>
                  <div className="text-muted-foreground">Cost: {formatCurrency(p.cost)}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Stock: {p.stock}</div>
                  <div>{stockBadge(p.stock)}</div>
                </div>
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <EmptyState message="No products found" />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Price</Label><Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div className="space-y-2"><Label>Cost</Label><Input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Stock</Label><Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Products with sales records cannot be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProductDetailModal
        product={detailProduct}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        context="products"
        onEdit={openEdit}
      />
    </div>
  );
}
