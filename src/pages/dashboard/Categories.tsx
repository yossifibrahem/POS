import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Settings, GripVertical, X } from "lucide-react";
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
  id: string;
  category_id: string;
  name: string;
  label: string;
  attribute_type: AttributeType;
  unit?: string;
  options?: string[];
  is_required: boolean;
  display_order: number;
  created_at: string;
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
  const [attrDialogOpen, setAttrDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [attributes, setAttributes] = useState<CategoryAttribute[]>([]);
  const [attrLoading, setAttrLoading] = useState(false);
  const [attrSaving, setAttrSaving] = useState(false);
  const [attrDeleteId, setAttrDeleteId] = useState<string | null>(null);
  const [editingAttr, setEditingAttr] = useState<CategoryAttribute | null>(null);
  
  // Attribute form state
  const [attrForm, setAttrForm] = useState({
    name: "",
    label: "",
    attribute_type: "text" as AttributeType,
    unit: "",
    options: [] as string[],
    is_required: false,
    display_order: 0,
  });
  const [newOption, setNewOption] = useState("");

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

  const openCreate = () => { setEditing(null); setName(""); setDialogOpen(true); };
  const openEdit = (c: Category) => { setEditing(c); setName(c.name); setDialogOpen(true); };

  const mapAttributes = (data: unknown[] | null): CategoryAttribute[] => {
    if (!data) return [];
    return data.map((attr: unknown) => ({
      ...(attr as CategoryAttribute),
      attribute_type: (attr as CategoryAttribute).attribute_type as AttributeType,
    }));
  };

  const openAttributes = async (c: Category) => {
    setSelectedCategory(c);
    setAttrDialogOpen(true);
    setAttrLoading(true);
    
    const { data } = await supabase
      .from("category_attributes")
      .select("*")
      .eq("category_id", c.id)
      .order("display_order");
    
    setAttributes(mapAttributes(data));
    setAttrLoading(false);
  };

  const resetAttrForm = () => {
    setAttrForm({
      name: "",
      label: "",
      attribute_type: "text",
      unit: "",
      options: [],
      is_required: false,
      display_order: attributes.length,
    });
    setNewOption("");
    setEditingAttr(null);
  };

  const closeAttrDialog = () => {
    setAttrDialogOpen(false);
    setSelectedCategory(null);
    setAttributes([]);
    resetAttrForm();
  };

  const handleSaveAttribute = async () => {
    if (!selectedCategory) return;
    if (!validateRequired(attrForm.name, "Attribute Name")) return;
    if (!validateRequired(attrForm.label, "Attribute Label")) return;
    
    // Validate enum has options
    if (attrForm.attribute_type === "enum" && attrForm.options.length === 0) {
      toast.error("Enum type requires at least one option");
      return;
    }

    setAttrSaving(true);

    const payload = {
      category_id: selectedCategory.id,
      name: attrForm.name.trim().toLowerCase().replace(/\s+/g, '_'),
      label: attrForm.label.trim(),
      attribute_type: attrForm.attribute_type,
      unit: attrForm.unit.trim() || null,
      options: attrForm.attribute_type === "enum" ? attrForm.options : null,
      is_required: attrForm.is_required,
      display_order: attrForm.display_order,
    };

    if (editingAttr) {
      const { error } = await supabase
        .from("category_attributes")
        .update(payload)
        .eq("id", editingAttr.id);
      
      if (error) handleError(error);
      else {
        handleSuccess("Attribute updated");
        resetAttrForm();
        // Refresh attributes
        const { data } = await supabase
          .from("category_attributes")
          .select("*")
          .eq("category_id", selectedCategory.id)
          .order("display_order");
        setAttributes(mapAttributes(data));
      }
    } else {
      const { error } = await supabase.from("category_attributes").insert(payload);
      
      if (error) {
        if (error.message.includes("unique constraint")) {
          toast.error("Attribute name must be unique within this category");
        } else {
          handleError(error);
        }
      } else {
        handleSuccess("Attribute created");
        resetAttrForm();
        // Refresh attributes
        const { data } = await supabase
          .from("category_attributes")
          .select("*")
          .eq("category_id", selectedCategory.id)
          .order("display_order");
        setAttributes(mapAttributes(data));
      }
    }
    
    setAttrSaving(false);
  };

  const handleDeleteAttribute = async () => {
    if (!attrDeleteId || !selectedCategory) return;
    
    const { error } = await supabase
      .from("category_attributes")
      .delete()
      .eq("id", attrDeleteId);
    
    if (error) handleError(error);
    else {
      handleSuccess("Attribute deleted");
      setAttributes(attributes.filter(a => a.id !== attrDeleteId));
    }
    
    setAttrDeleteId(null);
  };

  const openEditAttr = (attr: CategoryAttribute) => {
    setEditingAttr(attr);
    setAttrForm({
      name: attr.name,
      label: attr.label,
      attribute_type: attr.attribute_type,
      unit: attr.unit || "",
      options: attr.options || [],
      is_required: attr.is_required,
      display_order: attr.display_order,
    });
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    if (attrForm.options.includes(newOption.trim())) {
      toast.error("Option already exists");
      return;
    }
    setAttrForm({ ...attrForm, options: [...attrForm.options, newOption.trim()] });
    setNewOption("");
  };

  const removeOption = (index: number) => {
    setAttrForm({
      ...attrForm,
      options: attrForm.options.filter((_, i) => i !== index),
    });
  };

  const getTypeBadge = (type: AttributeType) => {
    const colors = {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Category</Button>
      </div>

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
                  <Button variant="ghost" size="icon" onClick={() => openAttributes(c)}><Settings className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <EmptyState message="No categories yet" />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <DialogFooter><Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter>
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

      {/* Attributes Management Dialog */}
      <Dialog open={attrDialogOpen} onOpenChange={closeAttrDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Attributes: {selectedCategory?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Existing Attributes List */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Existing Attributes</h4>
              {attrLoading ? (
                <div className="h-20 flex items-center justify-center">
                  <LoadingGrid count={1} columns={1} />
                </div>
              ) : attributes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No attributes defined yet</p>
              ) : (
                <div className="space-y-2">
                  {attributes.map((attr) => (
                    <div key={attr.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{attr.label}</span>
                          {getTypeBadge(attr.attribute_type)}
                          {attr.is_required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Key: {attr.name}
                          {attr.unit && ` • Unit: ${attr.unit}`}
                          {attr.options && ` • Options: ${attr.options.join(", ")}`}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditAttr(attr)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAttrDeleteId(attr.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Add/Edit Attribute Form */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">
                {editingAttr ? "Edit Attribute" : "Add New Attribute"}
              </h4>
              
              <div className="space-y-2">
                <Label>Display Label</Label>
                <Input 
                  value={attrForm.label} 
                  onChange={(e) => {
                    const label = e.target.value;
                    setAttrForm({ 
                      ...attrForm, 
                      label,
                      // Auto-generate name from label if not editing
                      name: editingAttr ? attrForm.name : label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
                    });
                  }}
                  placeholder="e.g., Screen Size"
                />
                <p className="text-xs text-muted-foreground">
                  Key: <code className="bg-muted px-1 rounded">{attrForm.name || "—"}</code>
                  {editingAttr && " (cannot change)"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select 
                    value={attrForm.attribute_type} 
                    onValueChange={(v: AttributeType) => setAttrForm({ ...attrForm, attribute_type: v })}
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
                    value={attrForm.unit} 
                    onChange={(e) => setAttrForm({ ...attrForm, unit: e.target.value })}
                    placeholder="e.g., GB, inch, cm"
                  />
                </div>
              </div>

              {/* Enum Options */}
              {attrForm.attribute_type === "enum" && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={newOption} 
                      onChange={(e) => setNewOption(e.target.value)}
                      placeholder="Add option..."
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                    />
                    <Button type="button" onClick={addOption} variant="outline">Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {attrForm.options.map((opt, idx) => (
                      <Badge key={idx} variant="secondary" className="gap-1">
                        {opt}
                        <button onClick={() => removeOption(idx)} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Display Order</Label>
                  <Input 
                    type="number" 
                    value={attrForm.display_order} 
                    onChange={(e) => setAttrForm({ ...attrForm, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch 
                    checked={attrForm.is_required} 
                    onCheckedChange={(v) => setAttrForm({ ...attrForm, is_required: v })}
                  />
                  <Label>Required Field</Label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveAttribute} disabled={attrSaving} className="flex-1">
                  {attrSaving ? "Saving..." : (editingAttr ? "Update Attribute" : "Add Attribute")}
                </Button>
                {editingAttr && (
                  <Button variant="outline" onClick={resetAttrForm}>Cancel Edit</Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Attribute Confirmation */}
      <AlertDialog open={!!attrDeleteId} onOpenChange={() => setAttrDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attribute?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the attribute definition. Existing products will retain the data but it won't be visible in forms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAttribute}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
