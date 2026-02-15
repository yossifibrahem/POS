import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Search, Plus, Minus, X, ShoppingCart } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category_id: string | null;
  categories?: { name: string } | null;
}

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
}

interface Customer {
  id: string;
  full_name: string;
  email: string;
}

export default function NewSale() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    supabase.from("products").select("*, categories(name)").order("name").then(({ data }) => setProducts(data || []));
    supabase.from("categories").select("*").order("name").then(({ data }) => setCategories(data || []));
    supabase.from("customers").select("id, full_name, email").order("full_name").then(({ data }) => {
      setCustomers(data || []);
      // Auto-select the customer if the logged-in user is an admin (their ID matches a customer ID)
      if (user) {
        const matchingCustomer = data?.find((c) => c.id === user.id);
        if (matchingCustomer) {
          setCustomerId(user.id);
        }
      }
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

  const processSale = async () => {
    if (!customerId) { toast.error("Select a customer"); return; }
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (!user) return;

    // Validate stock
    for (const item of cart) {
      if (item.quantity > item.product.stock) {
        toast.error(`Not enough stock for ${item.product.name}`);
        return;
      }
    }

    setProcessing(true);

    // Create cart
    const { data: cartData, error: cartError } = await supabase.from("carts").insert({
      customer_id: customerId,
      processed_by: user.id,
      total,
      notes: notes || null,
    }).select().single();

    if (cartError) { toast.error(cartError.message); setProcessing(false); return; }

    // Insert sold products
    const soldItems = cart.map((i) => ({
      cart_id: cartData.id,
      product_id: i.product.id,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }));

    const { error: soldError } = await supabase.from("sold_products").insert(soldItems);
    if (soldError) { toast.error(soldError.message); setProcessing(false); return; }

    // Decrement stock
    for (const item of cart) {
      await supabase.from("products").update({ stock: item.product.stock - item.quantity }).eq("id", item.product.id);
    }

    toast.success(`Sale processed! Total: $${total.toFixed(2)}`);
    setCart([]);
    setCustomerId("");
    setNotes("");
    setCartOpen(false);
    setProcessing(false);

    // Reload products for updated stock
    const { data } = await supabase.from("products").select("*, categories(name)").order("name");
    setProducts(data || []);
  };

  const filteredProducts = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== "all" && p.category_id !== filterCat) return false;
    return true;
  });

  const filteredCustomers = customers.filter((c) =>
    !customerSearch || c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) || c.email.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Sale</h1>
        <Button
          variant="outline"
          size="lg"
          className="relative gap-2"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingCart className="h-5 w-5" />
          Cart
          {cartItemCount > 0 && (
            <Badge variant="default" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs">
              {cartItemCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Product Picker - full width */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-h-[70vh] overflow-y-auto">
          {filteredProducts.map((p) => (
            <Card
              key={p.id}
              className={`transition hover:shadow-md ${p.stock === 0 ? "opacity-50" : ""}`}
            >
              <CardHeader>
                <CardTitle className="text-sm font-medium">{p.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">${Number(p.price).toFixed(2)}</span>
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
          ))}
        </div>
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
                  {filteredCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.email})</SelectItem>
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
                  <Card key={item.product.id} className="p-0">
                    <CardContent className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.product.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input className="w-14 h-6 text-center text-sm p-0" type="number" min="1" max={item.product.stock} value={item.quantity}
                            onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 1)} />
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="text-xs text-muted-foreground">×</span>
                          <Input className="w-20 h-6 text-sm p-1" type="number" min="0" step="0.01" value={item.unit_price}
                            onChange={(e) => updatePrice(item.product.id, parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">${(item.quantity * item.unit_price).toFixed(2)}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(item.product.id)}>
                          <X className="h-3 w-3" />
                        </Button>
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
              <span>${total.toFixed(2)}</span>
            </div>
            <Button className="w-full mt-3" size="lg" disabled={processing || cart.length === 0} onClick={processSale}>
              {processing ? "Processing..." : "Process Sale"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
