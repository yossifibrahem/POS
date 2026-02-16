import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { filterProducts, filterCustomers } from "@/lib/filters";
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
  attributes: Record<string, string | number | boolean>;
  categories?: { name: string } | null;
}

type AttributeType = 'text' | 'number' | 'boolean' | 'enum';

interface CategoryAttribute {
  id: string;
  category_id: string;
  name: string;
  label: string;
  attribute_type: AttributeType;
  unit?: string;
  options?: string[];
  is_required: boolean;
  display_order: number;
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
  const [loading, setLoading] = useState(true);
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
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [categoryAttributes, setCategoryAttributes] = useState<Record<string, CategoryAttribute[]>>({});

  const mapAttributes = (data: unknown[] | null): CategoryAttribute[] => {
    if (!data) return [];
    return data.map((attr: unknown) => ({
      ...(attr as CategoryAttribute),
      attribute_type: (attr as CategoryAttribute).attribute_type as AttributeType,
    }));
  };

  const mapProducts = (data: unknown[] | null): Product[] => {
    if (!data) return [];
    return data.map((p: unknown) => ({
      ...(p as Product),
      attributes: ((p as Product).attributes as Record<string, string | number | boolean>) || {},
    }));
  };

  useEffect(() => {
    Promise.all([
      supabase.from("products").select("*, categories(name)").order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("customers").select("id, full_name, email").order("full_name"),
    ]).then(([productsRes, categoriesRes, customersRes]) => {
      setProducts(mapProducts(productsRes.data));
      setCategories(categoriesRes.data || []);
      setCustomers(customersRes.data || []);
      // Auto-select the customer if the logged-in user is an admin (their ID matches a customer ID)
      if (user) {
        const matchingCustomer = customersRes.data?.find((c) => c.id === user.id);
        if (matchingCustomer) {
          setCustomerId(user.id);
        }
      }
      setLoading(false);
    });
  }, [user]);

  // Fetch category attributes for all categories
  useEffect(() => {
    if (categories.length === 0) return;
    
    const fetchAttributes = async () => {
      const { data } = await supabase
        .from("category_attributes")
        .select("*")
        .in("category_id", categories.map(c => c.id))
        .order("display_order");
      
      if (data) {
        const attrsByCategory: Record<string, CategoryAttribute[]> = {};
        data.forEach((attr) => {
          // Safely cast options to string array
          const options = attr.options;
          const stringOptions = Array.isArray(options) 
            ? options.filter((o): o is string => typeof o === "string")
            : undefined;
          
          const mappedAttr: CategoryAttribute = {
            id: attr.id,
            category_id: attr.category_id,
            name: attr.name,
            label: attr.label,
            attribute_type: attr.attribute_type as AttributeType,
            unit: attr.unit || undefined,
            options: stringOptions,
            is_required: attr.is_required,
            display_order: attr.display_order,
          };
          if (!attrsByCategory[attr.category_id]) {
            attrsByCategory[attr.category_id] = [];
          }
          attrsByCategory[attr.category_id].push(mappedAttr);
        });
        setCategoryAttributes(attrsByCategory);
      }
    };
    
    fetchAttributes();
  }, [categories]);

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

    // Create cart (total will be calculated by database trigger)
    const { data: cartData, error: cartError } = await supabase.from("carts").insert({
      customer_id: customerId,
      processed_by: user.id,
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

    // Fetch updated cart total from database (calculated by trigger)
    const { data: updatedCart } = await supabase.from("carts").select("total").eq("id", cartData.id).single();

    toast.success(`Sale processed! Total: $${Number(updatedCart?.total || 0).toFixed(2)}`);
    setCart([]);
    setCustomerId("");
    setNotes("");
    setCartOpen(false);
    setProcessing(false);

    // Reload products for updated stock
    const { data } = await supabase.from("products").select("*, categories(name)").order("name");
    setProducts(mapProducts(data));
  };

  const filteredProducts = filterProducts(products, search, filterCat);
  const filteredCustomers = filterCustomers(customers, customerSearch);

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  const openDetail = (p: Product) => {
    setDetailProduct(p);
    setDetailModalOpen(true);
  };

  const formatAttributeValue = (attr: CategoryAttribute, value: unknown): string => {
    if (value === undefined || value === null || value === "") return "";
    
    if (attr.attribute_type === "boolean") {
      return value ? attr.label : "";
    }
    
    if (attr.attribute_type === "number" && attr.unit) {
      return `${value}${attr.unit}`;
    }
    
    return String(value);
  };

  const getProductAttributeBadges = (product: Product) => {
    const attrs = categoryAttributes[product.category_id || ""];
    if (!attrs || attrs.length === 0) return null;
    
    // Get first 3 key attributes to display
    const keyAttrs = attrs.slice(0, 3);
    
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {keyAttrs.map((attr) => {
          const value = product.attributes?.[attr.name];
          if (!value && value !== false) return null;
          
          const displayValue = formatAttributeValue(attr, value);
          if (!displayValue) return null;
          
          return (
            <Badge key={attr.id} variant="outline" className="text-xs">
              {attr.label}: {displayValue}
            </Badge>
          );
        })}
      </div>
    );
  };

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
          {loading ? (
            <LoadingGrid count={6} columns={3} />
          ) : (
            filteredProducts.map((p) => (
              <Card
                key={p.id}
                className={`cursor-pointer transition hover:shadow-md ${p.stock === 0 ? "opacity-50" : ""}`}
                onClick={() => openDetail(p)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  {getProductAttributeBadges(p)}
                  <div className="flex items-center justify-between mt-2">
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
                        <p className="text-sm font-semibold">{formatCurrency(item.quantity * item.unit_price)}</p>
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
              <span>{formatCurrency(total)}</span>
            </div>
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
      />
    </div>
  );
}
