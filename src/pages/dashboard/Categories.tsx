import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { withLoading, handleError, handleSuccess, validateRequired } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";

interface Category {
  id: string;
  name: string;
  created_at: string;
  product_count?: number;
}

type AttributeType = 'text' | 'number' | 'boolean' | 'enum';

interface CategoryAttribute {
  id?: string;
  category_id: string;
  name: string;
  label: string;
  attribute_type: string;
  unit?: string;
  options?: Json;
  is_required: boolean;
  display_order: number;
}

// Helper to safely parse options from Json to string array
function parseOptions(options: Json | undefined): string[] {
  if (Array.isArray(options)) {
    return options.filter((o): o is string => typeof o === 'string');
  }
  return [];
}

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
  const [attributeForm, setAttributeForm] = useState<Partial<CategoryAttribute>>({
    name: "",
    label: "",
    attribute_type: "text",
    unit: "",
    options: [],
    is_required: false,
    display_order: 0,
  });
  const [attributeOptionsInput, setAttributeOptionsInput] = useState("");
  const [savingAttribute, setSavingAttribute] = useState(false);
  const [deleteAttributeId, setDeleteAttributeId] = useState<string | null>(null);

  const load = async () => {
    await withLoading(setLoading, async () => {
      const { data: cats } = await supabase.from("categories").select("*").order("name");
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
      setAttributes(data || []);
    }
  };

  const resetAttributeForm = () => {
    setEditingAttribute(null);
    setAttributeForm({
      name: "",
      label: "",
      attribute_type: "text",
      unit: "",
      options: [],
      is_required: false,
      display_order: attributes.length,
    });
    setAttributeOptionsInput("");
  };

  const openAddAttribute = () => {
    resetAttributeForm();
    setAttributesExpanded(true);
  };

  const openEditAttribute = (attr: CategoryAttribute) => {
    setEditingAttribute(attr);
    setAttributeForm({
      name: attr.name,
      label: attr.label,
      attribute_type: attr.attribute_type,
      unit: attr.unit || "",
      options: attr.options || [],
      is_required: attr.is_required,
      display_order: attr.display_order,
    });
    setAttributeOptionsInput(parseOptions(attr.options).join(", ") || "");
    setAttributesExpanded(true);
  };

  const handleSaveAttribute = async () => {
    if (!editing) return;
    if (!validateRequired(attributeForm.name, "Attribute name")) return;
    if (!validateRequired(attributeForm.label, "Attribute label")) return;
    
    // Validate name format (lowercase_snake_case)
    if (!/^[a-z][a-z0-9_]*$/.test(attributeForm.name || "")) {
      toast.error("Name must be lowercase with underscores (e.g., 'screen_size')");
      return;
    }

    // Validate enum has options
    const optionsArray = parseOptions(attributeForm.options);
    if (attributeForm.attribute_type === "enum" && optionsArray.length === 0) {
      toast.error("Enum type requires at least one option");
      return;
    }

    setSavingAttribute(true);

    const payload: CategoryAttribute = {
      category_id: editing.id,
      name: attributeForm.name!,
      label: attributeForm.label!,
      attribute_type: attributeForm.attribute_type as AttributeType,
      unit: attributeForm.unit || null,
      options: attributeForm.attribute_type === "enum" ? attributeForm.options : null,
      is_required: attributeForm.is_required || false,
      display_order: attributeForm.display_order || attributes.length,
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
        resetAttributeForm();
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
        resetAttributeForm();
      }
    }
    
    setSavingAttribute(false);
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

  const handleOptionsInputChange = (value: string) => {
    setAttributeOptionsInput(value);
    const options = value.split(",").map(o => o.trim()).filter(o => o);
    setAttributeForm(prev => ({ ...prev, options }));
  };

  const getAttributeTypeBadge = (type: AttributeType) => {
    const colors: Record<AttributeType, string> = {
      text: "bg-blue-100 text-blue-800",
      number: "bg-green-100 text-green-800",
      boolean: "bg-purple-100 text-purple-800",
      enum: "bg-orange-100 text-orange-800",
    };
    return <Badge className={colors[type]}>{type}</Badge>;
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
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Category</Button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <LoadingGrid count={6} columns={3} />
        ) : categories.length > 0 ? (
          categories.map((c) => (
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
          <EmptyState message="No categories yet" />
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
                                {getAttributeTypeBadge(attr.attribute_type as AttributeType)}
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
                    <div className="space-y-4 p-4 border rounded-md">
                      <h4 className="font-medium">
                        {editingAttribute ? "Edit Attribute" : "Add New Attribute"}
                      </h4>
                      
                      <div className="space-y-2">
                        <Label>Label (display name)</Label>
                        <Input 
                          value={attributeForm.label} 
                          onChange={(e) => {
                            const label = e.target.value;
                            const name = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                            setAttributeForm({ ...attributeForm, label, name });
                          }}
                          placeholder="e.g., Screen Size"
                        />
                        <p className="text-xs text-muted-foreground">Key: {attributeForm.name || 'auto-generated from label'}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select 
                            value={attributeForm.attribute_type} 
                            onValueChange={(v: AttributeType) => setAttributeForm({ ...attributeForm, attribute_type: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="boolean">Boolean</SelectItem>
                              <SelectItem value="enum">Enum (Dropdown)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Unit (optional)</Label>
                          <Input 
                            value={attributeForm.unit} 
                            onChange={(e) => setAttributeForm({ ...attributeForm, unit: e.target.value })}
                            placeholder="e.g., GB, inch"
                          />
                        </div>
                      </div>

                      {attributeForm.attribute_type === "enum" && (
                        <div className="space-y-2">
                          <Label>Options (comma-separated)</Label>
                          <Input 
                            value={attributeOptionsInput} 
                            onChange={(e) => handleOptionsInputChange(e.target.value)}
                            placeholder="e.g., 4, 8, 16, 32"
                          />
                          <p className="text-xs text-muted-foreground">Enter values separated by commas</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="required"
                          checked={attributeForm.is_required} 
                          onCheckedChange={(checked) => setAttributeForm({ ...attributeForm, is_required: checked as boolean })}
                        />
                        <Label htmlFor="required" className="cursor-pointer">Required field</Label>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          onClick={handleSaveAttribute} 
                          disabled={savingAttribute}
                          size="sm"
                        >
                          {savingAttribute ? "Saving..." : (editingAttribute ? "Update" : "Add")}
                        </Button>
                        {editingAttribute && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={resetAttributeForm}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>

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
