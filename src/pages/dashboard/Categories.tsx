import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, GripVertical, Search } from "lucide-react";
import { withLoading, handleError, handleSuccess, validateRequired } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";
import { CategoryAttributeForm } from "@/components/CategoryAttributeForm";
import type { Category, CategoryAttribute, AttributeType } from "@/types/category";
import { parseOptions, getAttributeTypeBadgeClass } from "@/lib/attributes";

export default function Categories() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Attribute management state
  const [attributes, setAttributes] = useState<CategoryAttribute[]>([]);
  const [attributesExpanded, setAttributesExpanded] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<CategoryAttribute | null>(null);
  const [deleteAttributeId, setDeleteAttributeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    await withLoading(setLoading, async () => {
      const { data: cats } = await supabase.from("categories").select("*").order("created_at", { ascending: false });
      if (!cats) return;
      // Get product counts
      const { data: products } = await supabase.from("products").select("category_id");
      const counts: Record<string, number> = {};
      (products || []).forEach((p) => { if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1; });
      setCategories(cats.map((c) => ({ ...c, product_count: counts[c.id] || 0 })));
    });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { 
    setEditing(null); 
    setName(""); 
    setAttributes([]); 
    setAttributesExpanded(false);
    setDialogOpen(true); 
  };
  
  const openEdit = async (c: Category) => { 
    setEditing(c); 
    setName(c.name); 
    setAttributesExpanded(false);
    await loadAttributes(c.id);
    setDialogOpen(true); 
  };

  const loadAttributes = async (categoryId: string) => {
    const { data, error } = await supabase
      .from("category_attributes")
      .select("*")
      .eq("category_id", categoryId)
      .order("display_order");
    
    if (error) {
      handleError(error, "Failed to load attributes");
      setAttributes([]);
    } else {
      setAttributes((data || []).map(attr => ({
        ...attr,
        attribute_type: attr.attribute_type as AttributeType,
        unit: attr.unit || null,
      })));
    }
  };

  const openAddAttribute = () => {
    setEditingAttribute(null);
    setAttributesExpanded(true);
  };

  const openEditAttribute = (attr: CategoryAttribute) => {
    setEditingAttribute(attr);
    setAttributesExpanded(true);
  };

  const handleSaveAttribute = async (formData: Partial<CategoryAttribute>) => {
    if (!editing) return;
    
    const payload: CategoryAttribute = {
      category_id: editing.id,
      name: formData.name!,
      label: formData.label!,
      attribute_type: formData.attribute_type as AttributeType,
      unit: formData.unit || null,
      options: formData.attribute_type === "enum" ? formData.options : null,
      is_required: formData.is_required || false,
      display_order: formData.display_order ?? attributes.length,
    };

    if (editingAttribute?.id) {
      const { error } = await supabase
        .from("category_attributes")
        .update(payload)
        .eq("id", editingAttribute.id);
      
      if (error) {
        handleError(error, "Failed to update attribute");
      } else {
        handleSuccess("Attribute updated");
        await loadAttributes(editing.id);
        setEditingAttribute(null);
      }
    } else {
      const { error } = await supabase
        .from("category_attributes")
        .insert(payload);
      
      if (error) {
        handleError(error, "Failed to create attribute");
      } else {
        handleSuccess("Attribute created");
        await loadAttributes(editing.id);
        setEditingAttribute(null);
      }
    }
  };

  const handleDeleteAttribute = async () => {
    if (!deleteAttributeId || !editing) return;
    
    const { error } = await supabase
      .from("category_attributes")
      .delete()
      .eq("id", deleteAttributeId);
    
    if (error) {
      handleError(error, "Failed to delete attribute");
    } else {
      handleSuccess("Attribute deleted");
      await loadAttributes(editing.id);
    }
    
    setDeleteAttributeId(null);
  };

  const handleSave = async () => {
    if (!validateRequired(name, "Name")) return;
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("categories").update({ name: name.trim() }).eq("id", editing.id);
      if (error) handleError(error); else { handleSuccess("Category updated"); setDialogOpen(false); load(); }
    } else {
      const { error } = await supabase.from("categories").insert({ name: name.trim() });
      if (error) handleError(error); else { handleSuccess("Category created"); setDialogOpen(false); load(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("categories").delete().eq("id", deleteId);
    if (error) {
      handleError(error, "Cannot delete: category has products");
    } else { handleSuccess("Category deleted"); load(); }
    setDeleteId(null);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="sticky top-[48px] z-10 flex items-center justify-between bg-background py-2">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Category</Button>
      </div>

      <div className="sticky top-[96px] z-10 flex flex-col sm:flex-row gap-3 bg-background py-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search categories..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="pt-4 pb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <LoadingGrid count={6} columns={3} />
        ) : categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).length > 0 ? (
          categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{c.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">{c.product_count} product{c.product_count === 1 ? "" : "s"}</div>
                <div className="text-sm">{formatDate(c.created_at)}</div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <EmptyState message={search ? "No categories found" : "No categories yet"} />
        )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(85vh-8rem)]">
          <div className="space-y-6 px-6 pb-6">
            {/* Category Name */}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" />
            </div>

            {/* Attributes Section - Only show when editing */}
            {editing && (
              <div className="space-y-4">
                <Separator />
                
                <div 
                  className="flex items-center justify-between cursor-pointer p-2 hover:bg-muted rounded-md"
                  onClick={() => setAttributesExpanded(!attributesExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Category Attributes</h3>
                    <Badge variant="secondary">{attributes.length}</Badge>
                  </div>
                  {attributesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>

                {attributesExpanded && (
                  <div className="space-y-4">
                    {/* Attributes List */}
                    {attributes.length > 0 && (
                      <div className="space-y-2">
                        {attributes.map((attr) => (
                          <div key={attr.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{attr.label}</span>
                                <Badge className={getAttributeTypeBadgeClass(attr.attribute_type as AttributeType)}>{attr.attribute_type}</Badge>
                                {attr.is_required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {attr.name}
                                {attr.unit && ` • Unit: ${attr.unit}`}
                                {attr.attribute_type === "enum" && ` • Options: ${parseOptions(attr.options).join(", ")}`}
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => openEditAttribute(attr)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteAttributeId(attr.id!)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add/Edit Attribute Form */}
                    <CategoryAttributeForm
                      initialData={editingAttribute || undefined}
                      attributesCount={attributes.length}
                      onSave={handleSaveAttribute}
                      onCancel={editingAttribute ? () => setEditingAttribute(null) : undefined}
                      isEditing={!!editingAttribute}
                    />

                    {attributes.length === 0 && !editingAttribute && (
                      <Button variant="outline" onClick={openAddAttribute} className="w-full">
                        <Plus className="mr-2 h-4 w-4" /> Add First Attribute
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          </ScrollArea>
          <div className="px-6 pb-6">
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>Categories with products cannot be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteAttributeId} onOpenChange={() => setDeleteAttributeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attribute?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the attribute from all products in this category.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAttribute} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
