import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { withLoading, handleError, handleSuccess, validateRequired } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";

interface Category {
  id: string;
  name: string;
  created_at: string;
  product_count?: number;
}

export default function Categories() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

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
    </div>
  );
}
