import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canSeeCostAndProfit } from "@/lib/permissions";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Search, Plus, Minus, X, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { filterProducts, filterCustomers, sortProducts, SortOptions } from "@/lib/filters";
import { LoadingGrid } from "@/components/LoadingGrid";
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
  attributes?: Json;
}

// Helper to safely parse attributes from Json to a record
function parseAttributes(attributes: Json | undefined): Record<string, string | number | boolean> {
  if (typeof attributes === 'object' && attributes !== null && !Array.isArray(attributes)) {
    return attributes as Record<string, string | number | boolean>;
  }
  return {};
}

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
}

interface Profile {
  id?: string;
  full_name: string;
  email: string;
}

interface Customer {
  id: string;
  created_at: string;
  profiles: Profile | null;
}

export default function NewSale() {
  const { user, adminLevel } = useAuth();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [sort, setSort] = useState<SortOptions>({ field: "name", direction: "asc" });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("walk-in");
  const [customerSearch, setCustomerSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("products").select("*, categories(name)").order("name"),
      supabase.from("customers").select("*, profiles(full_name, email)").order("profiles(full_name)"),
      supabase.from("categories").select("*"),
    ]).then(([productsRes, customersRes, categoriesRes]) => {
      setProducts((productsRes.data || []) as Product[]);
      setCustomers(customersRes.data || []);
      setCategories(categoriesRes.data || []);
      setLoading(false);
    });
  }, [user]);


  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) { toast.error("Not enough stock"); return prev; }
        return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1, unit_price: product.price }];
    });
  };

  const updateQuantity = (productId: string, qty: number) => {
    const item = cart.find((i) => i.product.id === productId);
    if (!item) return;
    if (qty > item.product.stock) { toast.error("Not enough stock"); return; }
    if (qty <= 0) { setCart((prev) => prev.filter((i) => i.product.id !== productId)); return; }
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, quantity: qty } : i));
  };

  const updatePrice = (productId: string, price: number) => {
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, unit_price: price } : i));
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const total = cart.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const originalTotal = cart.reduce((s, i) => s + i.quantity * i.product.price, 0);
  const discount = originalTotal - total;

  const processSale = async () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (!user) return;

    setProcessing(true);

    try {
      // Create cart — stock is deducted when status transitions to 'completed'
      const customerIdForSale = customerId === "walk-in" ? null : customerId;
      const { data: cartData, error: cartError } = await supabase.from("carts").insert({
        customer_id: customerIdForSale,
        processed_by: user.id,
        notes: notes || null,
        status: "pending",
      }).select().single();

      if (cartError) throw cartError;

      // Insert sold products (immutable record - no status needed)
      const soldItems = cart.map((i) => ({
        cart_id: cartData.id,
        product_id: i.product.id,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }));

      const { error: soldError } = await supabase.from("sold_products").insert(soldItems);
      if (soldError) throw soldError;

      // Complete the cart - DB trigger will deduct stock here
      // If insufficient stock, the DB will throw a CHECK constraint violation
      const { error: completeError } = await supabase
        .from("carts")
        .update({ status: "completed" })
        .eq("id", cartData.id);

      if (completeError) {
        // Cancel the pending cart to avoid orphaned records
        await supabase.from("carts").update({ status: "cancelled" }).eq("id", cartData.id);
        throw new Error(
          completeError.message?.includes("stock")
            ? "Insufficient stock for one or more items."
            : "Failed to complete sale. Please try again."
        );
      }

      // Fetch updated cart total from database (calculated by trigger)
      const { data: updatedCart } = await supabase.from("carts").select("total").eq("id", cartData.id).single();

      toast.success(`Sale completed! Total: ${formatCurrency(Number(updatedCart?.total || 0))}`);
      setCart([]);
      setCustomerId("walk-in");
      setNotes("");
      setCartOpen(false);

    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Failed to process sale";
      toast.error(errorMessage);
    } finally {
      setProcessing(false);
      
      // Reload products for updated stock
      const { data } = await supabase.from("products").select("*, categories(name)").order("name");
      setProducts(data || []);
    }
  };

  const filteredProducts = sortProducts(
    filterProducts(products, search, filterCat),
    sort
  );
  const filteredCustomers = filterCustomers(customers, customerSearch);

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  const openDetail = (p: Product) => {
    setDetailProduct(p);
    setDetailModalOpen(true);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="sticky top-[48px] z-10 flex items-center justify-between bg-background py-2">
        <h1 className="text-2xl font-bold">New Sale</h1>
        <Button
          variant="outline"
          className="relative gap-2"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingCart className="h-4 w-4" />
          Cart
          {cartItemCount > 0 && (
            <Badge variant="default" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs">
              {cartItemCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Product Picker - full width */}
      <div className="sticky top-[96px] z-10 bg-background py-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
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
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Sort by..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                <SelectItem value="price-asc">Price (Low-High)</SelectItem>
                <SelectItem value="price-desc">Price (High-Low)</SelectItem>
                <SelectItem value="stock-asc">Stock (Low-High)</SelectItem>
                <SelectItem value="stock-desc">Stock (High-Low)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4 pb-6">
        {loading ? (
          <LoadingGrid count={6} columns={3} />
        ) : (
          filteredProducts.map((p) => (
            <Card
              key={p.id}
              className={`cursor-pointer transition hover:shadow-md ${p.stock === 0 ? "opacity-50" : ""}`}
              onClick={() => openDetail(p)}
            >
              <CardHeader>
                <CardTitle className="text-sm font-medium">{p.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {/* Category */}
                <div className="text-sm text-muted-foreground">{p.categories?.name || "—"}</div>
                {/* Attributes preview */}
                {(() => {
                  const attrs = parseAttributes(p.attributes);
                  const entries = Object.entries(attrs);
                  if (entries.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1">
                      {entries.slice(0, 3).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs font-normal">
                          {key}: {String(value)}
                        </Badge>
                      ))}
                      {entries.length > 3 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          +{entries.length - 3} more
                        </Badge>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatCurrency(p.price)}</span>
                    <Badge variant={p.stock === 0 ? "destructive" : "secondary"} className="text-xs">
                      {p.stock} left
                    </Badge>
                  </div>
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); if (p.stock > 0) addToCart(p); }} disabled={p.stock === 0}>
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Cart slide-over from the right */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> Cart ({cart.length} items)
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Customer selector */}
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                  {filteredCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.profiles?.full_name || "Unknown"} ({c.profiles?.email || "—"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cart items */}
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Use the "Add" button on products to add them to the cart</p>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <Card key={item.product.id} className="p-3 relative">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 absolute top-2 right-2 text-muted-foreground hover:text-destructive" 
                      onClick={() => removeItem(item.product.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <CardContent className="p-0 pr-8">
                      <p className="text-sm font-medium truncate pr-2">{item.product.name}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input className="w-14 h-7 text-center text-sm" type="number" min="1" max={item.product.stock} value={item.quantity}
                          onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 1)} />
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Price:</span>
                          <Input className="w-24 h-7 text-sm" type="number" min="0" step="0.01" value={item.unit_price}
                            onChange={(e) => updatePrice(item.product.id, parseFloat(e.target.value) || 0)} />
                          {item.product.price > item.unit_price && (
                            <span className="text-sm text-green-600">-{formatCurrency(item.product.price - item.unit_price)}/unit</span>
                          )}
                          {item.product.price < item.unit_price && (
                            <span className="text-sm text-amber-600">+{formatCurrency(item.unit_price - item.product.price)}/unit</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold">{formatCurrency(item.quantity * item.unit_price)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this sale..." rows={2} />
            </div>
          </div>

          {/* Total & Process - sticky at bottom of sheet */}
          <div className="border-t px-6 py-4 bg-background">
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            {discount > 0 && (
              <div className="flex items-center justify-between text-sm text-green-600 mt-1">
                <span>Discount</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}
            {discount < 0 && (
              <div className="flex items-center justify-between text-sm text-amber-600 mt-1">
                <span>Extra</span>
                <span>+{formatCurrency(Math.abs(discount))}</span>
              </div>
            )}
            <Button className="w-full mt-3" size="lg" disabled={processing || cart.length === 0} onClick={processSale}>
              {processing ? "Processing..." : "Process Sale"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ProductDetailModal
        product={detailProduct}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        context="newsale"
        onAddToCart={addToCart}
        showCost={canSeeCostAndProfit(adminLevel)}
      />
    </div>
  );
}
