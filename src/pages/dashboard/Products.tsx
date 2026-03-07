import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useInventoryRealtime } from "@/hooks/useRealtimeSubscription";
import { canSeeCostAndProfit } from "@/lib/permissions";
import { parseSortFromURL } from "@/lib/urlSort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { withLoading, handleError, handleSuccess, validateRequired, validateNonNegative } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { filterProducts, sortProducts, SortOptions } from "@/lib/filters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";
import { ProductDetailModal } from "@/components/ProductDetailModal";
import type { CategoryAttribute, AttributeType } from "@/types/category";
import { parseOptions } from "@/lib/attributes";

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  category_id: string | null;
  created_at: string;
  categories?: { name: string } | null;
  attributes?: Record<string, string | number | boolean>;
}

interface Category {
  id: string;
  name: string;
}

export default function Products() {
  const { adminLevel } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [sort, setSort] = useState<SortOptions>(() => parseSortFromURL(searchParams));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", price: "", cost: "", stock: "", category_id: "" });
  const [saving, setSaving] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // Attribute management state
  const [categoryAttributes, setCategoryAttributes] = useState<CategoryAttribute[]>([]);
  const [productAttributes, setProductAttributes] = useState<Record<string, string | number | boolean>>({});

  const load = useCallback(async () => {
    await withLoading(setLoading, async () => {
      const { data } = await supabase.from("products").select("*, categories(name)").order("created_at", { ascending: false });
      setProducts((data || []) as Product[]);
      const { data: cats } = await supabase.from("categories").select("*").order("name");
      setCategories(cats || []);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Subscribe to real-time updates for products and categories
  const handleInventoryChange = useCallback(() => {
    load();
  }, [load]);

  useInventoryRealtime({
    onChange: handleInventoryChange,
  });


  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", price: "", cost: "", stock: "", category_id: "" });
    setCategoryAttributes([]);
    setProductAttributes({});
    setDialogOpen(true);
  };

  const openEdit = async (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, price: String(p.price), cost: String(p.cost), stock: String(p.stock), category_id: p.category_id || "" });
    if (p.category_id) {
      await loadCategoryAttributes(p.category_id);
    }
    setProductAttributes(p.attributes || {});
    setDialogOpen(true);
  };

  const loadCategoryAttributes = async (categoryId: string) => {
    const { data, error } = await supabase
      .from("category_attributes")
      .select("*")
      .eq("category_id", categoryId)
      .order("display_order");
    
    if (error) {
      handleError(error, "Failed to load category attributes");
      setCategoryAttributes([]);
    } else {
      setCategoryAttributes((data || []) as CategoryAttribute[]);
    }
  };

  const handleCategoryChange = async (categoryId: string) => {
    const actualCategoryId = categoryId === "none" ? "" : categoryId;
    setForm({ ...form, category_id: actualCategoryId });
    if (actualCategoryId) {
      await loadCategoryAttributes(actualCategoryId);
      // Reset product attributes when category changes
      setProductAttributes({});
    } else {
      setCategoryAttributes([]);
      setProductAttributes({});
    }
  };

  const handleAttributeChange = (name: string, value: string | number | boolean) => {
    setProductAttributes(prev => ({ ...prev, [name]: value }));
  };

  const getAttributeInput = (attr: CategoryAttribute) => {
    const value = productAttributes[attr.name];

    switch (attr.attribute_type) {
      case 'text':
        return (
          <Input
            value={String(value || "")}
            onChange={(e) => handleAttributeChange(attr.name, e.target.value)}
            placeholder={`Enter ${attr.label.toLowerCase()}`}
          />
        );
      
      case 'number':
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={String(value || "")}
              onChange={(e) => handleAttributeChange(attr.name, parseFloat(e.target.value) || 0)}
              placeholder={`Enter ${attr.label.toLowerCase()}`}
            />
            {attr.unit && <span className="text-sm text-muted-foreground whitespace-nowrap">{attr.unit}</span>}
          </div>
        );
      
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`attr-${attr.name}`}
              checked={Boolean(value)}
              onCheckedChange={(checked) => handleAttributeChange(attr.name, checked as boolean)}
            />
            <Label htmlFor={`attr-${attr.name}`} className="cursor-pointer">
              {value ? "Yes" : "No"}
            </Label>
          </div>
        );
      
      case 'enum':
        return (
          <Select
            value={String(value || "")}
            onValueChange={(v) => handleAttributeChange(attr.name, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${attr.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {parseOptions(attr.options).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}{attr.unit ? ` ${attr.unit}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      
      default:
        return null;
    }
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

    // Validate required attributes
    for (const attr of categoryAttributes) {
      if (attr.is_required && !productAttributes[attr.name]) {
        toast.error(`${attr.label} is required`);
        return;
      }
    }
    
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      price: Number(form.price) || 0,
      cost: canSeeCostAndProfit(adminLevel) ? Number(form.cost) || 0 : 0,
      stock: parseInt(form.stock) || 0,
      category_id: form.category_id || null,
      attributes: productAttributes,
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
    if (stock <= 2) return <Badge variant="secondary">Low Stock</Badge>;
    return <Badge variant="outline">In Stock</Badge>;
  };

  const filtered = sortProducts(
    filterProducts(products, search, filterCat),
    sort
  );

  return (
    <div className="p-4 md:p-6">
      {/* Search and Action bar row */}
      <div className="sticky top-[48px] z-10 flex items-center gap-2 bg-background py-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={openCreate} size="icon"><Plus className="h-5 w-5" /></Button>
      </div>

      {/* Filters row - grid with one row */}
      <div className="sticky top-[96px] z-10 bg-background py-2">
        <div className="grid grid-cols-2 gap-3">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select 
            value={`${sort.field}-${sort.direction}`} 
            onValueChange={(value) => {
              const [field, direction] = value.split("-") as [SortOptions["field"], SortOptions["direction"]];
              setSort({ field, direction });
            }}
          >
            <SelectTrigger><SelectValue placeholder="Sort by..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z-A)</SelectItem>
              <SelectItem value="price-asc">Price (Low-High)</SelectItem>
              <SelectItem value="price-desc">Price (High-Low)</SelectItem>
              <SelectItem value="stock-asc">Stock (Low-High)</SelectItem>
              <SelectItem value="stock-desc">Stock (High-Low)</SelectItem>
              <SelectItem value="created_at-desc">Newest First</SelectItem>
              <SelectItem value="created_at-asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="pt-4 pb-6">
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
                  {canSeeCostAndProfit(adminLevel) && (
                    <div className="text-muted-foreground">Cost: {formatCurrency(p.cost)}</div>
                  )}
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
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Price</Label><Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                {canSeeCostAndProfit(adminLevel) && (
                  <div className="space-y-2"><Label>Cost</Label><Input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Stock</Label><Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category_id || "none"} onValueChange={handleCategoryChange}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Dynamic Attributes Section */}
            {categoryAttributes.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="font-medium">Category Attributes</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {categoryAttributes.map((attr) => (
                      <div key={attr.name} className="space-y-2">
                        <Label className="flex items-center gap-1">
                          {attr.label}
                          {attr.is_required && <span className="text-destructive">*</span>}
                        </Label>
                        {getAttributeInput(attr)}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
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
        showCost={canSeeCostAndProfit(adminLevel)}
      />
    </div>
  );
}
