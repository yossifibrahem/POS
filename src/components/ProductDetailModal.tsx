import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Package, Tag, DollarSign, Coins, Box, Calendar, ShoppingCart, Pencil, Check, X, List } from "lucide-react";

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

// Helper to safely get attribute value from Json
function getAttributeValue(attributes: Json | undefined, key: string): string | number | boolean | undefined {
  if (typeof attributes === 'object' && attributes !== null && !Array.isArray(attributes)) {
    return (attributes as Record<string, Json>)[key] as string | number | boolean | undefined;
  }
  return undefined;
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

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: "products" | "newsale";
  onEdit?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  showCost?: boolean;
}

export function ProductDetailModal({
  product,
  open,
  onOpenChange,
  context,
  onEdit,
  onAddToCart,
  showCost = true,
}: ProductDetailModalProps) {
  const [categoryAttributes, setCategoryAttributes] = useState<CategoryAttribute[]>([]);

  useEffect(() => {
    if (product?.category_id) {
      loadCategoryAttributes(product.category_id);
    } else {
      setCategoryAttributes([]);
    }
  }, [product?.category_id]);

  const loadCategoryAttributes = async (categoryId: string) => {
    const { data } = await supabase
      .from("category_attributes")
      .select("*")
      .eq("category_id", categoryId)
      .order("display_order");
    
    setCategoryAttributes((data || []) as CategoryAttribute[]);
  };

  const formatAttributeValue = (attr: CategoryAttribute, value: string | number | boolean | undefined) => {
    if (value === undefined || value === null) return "—";
    
    switch (attr.attribute_type) {
      case 'boolean':
        return value ? (
          <span className="flex items-center gap-1 text-green-600"><Check className="h-4 w-4" /> Yes</span>
        ) : (
          <span className="flex items-center gap-1 text-gray-500"><X className="h-4 w-4" /> No</span>
        );
      case 'number':
        return attr.unit ? `${value} ${attr.unit}` : String(value);
      default:
        return attr.unit ? `${value} ${attr.unit}` : String(value);
    }
  };

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5 text-primary" />
            {product.name}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-8rem)] px-6">
        <div className="space-y-8 pb-6">
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
            
            <div className={`grid gap-6 ${showCost ? 'grid-cols-3' : 'grid-cols-1'}`}>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-5 w-5" />
                  <span>Price</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-primary">{formatCurrency(product.price)}</p>
              </div>

              {showCost && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Coins className="h-5 w-5" />
                      <span>Cost</span>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold">{formatCurrency(product.cost)}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-5 w-5" />
                      <span>Profit</span>
                    </div>
                    <p className={`text-xl sm:text-2xl font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(profit)}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Profit Info - Only show for high admins */}
            {showCost && (
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
            )}
          </div>

          <Separator />

          {/* Attributes Section */}
          {categoryAttributes.length > 0 && (
            <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <List className="h-4 w-4" />
                  Specifications
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {categoryAttributes.map((attr) => (
                    <div key={attr.name} className="space-y-1">
                      <div className="text-xs text-muted-foreground">{attr.label}</div>
                      <div className="font-medium">
                        {formatAttributeValue(attr, getAttributeValue(product.attributes, attr.name))}
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          )}

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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
