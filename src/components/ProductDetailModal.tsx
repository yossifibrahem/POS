import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { Package, Tag, DollarSign, Coins, Box, Calendar, ShoppingCart, Pencil, Check, X } from "lucide-react";

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
  name: string;
  label: string;
  attribute_type: AttributeType;
  unit?: string;
  options?: string[];
  is_required: boolean;
  display_order: number;
}

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: "products" | "newsale";
  onEdit?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
}

export function ProductDetailModal({
  product,
  open,
  onOpenChange,
  context,
  onEdit,
  onAddToCart,
}: ProductDetailModalProps) {
  const [categoryAttributes, setCategoryAttributes] = useState<CategoryAttribute[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);

  const mapAttributes = (data: unknown[] | null): CategoryAttribute[] => {
    if (!data) return [];
    return data.map((attr: unknown) => ({
      ...(attr as CategoryAttribute),
      attribute_type: (attr as CategoryAttribute).attribute_type as AttributeType,
    }));
  };

  useEffect(() => {
    if (product?.category_id) {
      setLoadingAttrs(true);
      supabase
        .from("category_attributes")
        .select("*")
        .eq("category_id", product.category_id)
        .order("display_order")
        .then(({ data }) => {
          setCategoryAttributes(mapAttributes(data));
          setLoadingAttrs(false);
        });
    } else {
      setCategoryAttributes([]);
    }
  }, [product?.category_id]);

  if (!product) return null;

  const stockBadge = () => {
    if (product.stock === 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (product.stock < 10) return <Badge variant="secondary">Low Stock</Badge>;
    return <Badge variant="outline" className="text-green-600 border-green-600">In Stock</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const profit = product.price - product.cost;
  const profitMargin = product.price > 0 ? ((profit / product.price) * 100).toFixed(1) : "0";

  const formatAttributeValue = (attr: CategoryAttribute, value: unknown): string => {
    if (value === undefined || value === null || value === "") return "—";
    
    if (attr.attribute_type === "boolean") {
      return value ? "Yes" : "No";
    }
    
    if (attr.attribute_type === "number" && attr.unit) {
      return `${value} ${attr.unit}`;
    }
    
    return String(value);
  };

  const getAttributeIcon = (attr: CategoryAttribute, value: unknown) => {
    if (attr.attribute_type === "boolean") {
      return value ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <X className="h-4 w-4 text-red-600" />
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5 text-primary" />
            {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8">
          {/* Category */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Tag className="h-4 w-4" />
            <span>{product.categories?.name || "Uncategorized"}</span>
          </div>

          {/* Stock Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Stock:</span>
              <span className="font-semibold">{product.stock} units</span>
            </div>
            {stockBadge()}
          </div>

          <Separator />

          {/* Pricing Information */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Pricing</h4>
            
            <div className="grid grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-5 w-5" />
                  <span>Selling Price</span>
                </div>
                <p className="text-3xl font-bold text-primary">{formatCurrency(product.price)}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Coins className="h-5 w-5" />
                  <span>Cost</span>
                </div>
                <p className="text-3xl font-bold">{formatCurrency(product.cost)}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-5 w-5" />
                  <span>Profit</span>
                </div>
                <p className={`text-3xl font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(profit)}
                </p>
              </div>
            </div>

            {/* Profit Info */}
            <div className="rounded-lg bg-muted p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Profit per unit:</span>
                <span className={`font-semibold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(profit)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Profit margin:</span>
                <span className={`font-semibold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {profitMargin}%
                </span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Attributes Section */}
          {categoryAttributes.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">Product Specifications</h4>
              <div className="grid grid-cols-2 gap-4">
                {categoryAttributes.map((attr) => {
                  const value = product.attributes?.[attr.name];
                  const icon = getAttributeIcon(attr, value);
                  
                  return (
                    <div key={attr.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{attr.label}</span>
                        {attr.is_required && <span className="text-destructive text-xs">*</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {icon}
                        <span className="text-sm font-medium">
                          {formatAttributeValue(attr, value)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Separator />

          {/* Additional Info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Added on {formatDate(product.created_at)}</span>
          </div>

          {/* Action Buttons - Context Aware */}
          <div className="flex gap-3 pt-4">
            {context === "products" && onEdit && (
              <Button 
                className="flex-1" 
                onClick={() => {
                  onEdit(product);
                  onOpenChange(false);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit Product
              </Button>
            )}
            
            {context === "newsale" && onAddToCart && (
              <Button 
                className="flex-1" 
                onClick={() => {
                  onAddToCart(product);
                  onOpenChange(false);
                }}
                disabled={product.stock === 0}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                {product.stock === 0 ? "Out of Stock" : "Add to Cart"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
