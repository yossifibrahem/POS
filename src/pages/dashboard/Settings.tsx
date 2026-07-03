import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BranchContext } from "@/hooks/authContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Save } from "lucide-react";

const emptyBranchForm = {
  name: "",
  address: "",
  phone: "",
  is_active: true,
};

export default function Settings() {
  const { organization, branches, activeBranchId, refreshTenant } = useAuth();
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchContext | null>(null);
  const [organizationForm, setOrganizationForm] = useState({
    name: "",
    contact_email: "",
    phone: "",
    address: "",
    currency_code: "USD",
  });
  const [branchForm, setBranchForm] = useState(emptyBranchForm);

  useEffect(() => {
    if (!organization) return;
    setOrganizationForm({
      name: organization.name || "",
      contact_email: organization.contact_email || "",
      phone: organization.phone || "",
      address: organization.address || "",
      currency_code: organization.currency_code || "USD",
    });
  }, [organization]);

  const saveOrganization = async () => {
    if (!organization) return;
    if (!organizationForm.name.trim()) {
      toast.error("Organization name is required");
      return;
    }
    if (organizationForm.currency_code.trim().length !== 3) {
      toast.error("Currency code must be 3 letters");
      return;
    }

    setSavingOrganization(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: organizationForm.name.trim(),
        contact_email: organizationForm.contact_email.trim() || null,
        phone: organizationForm.phone.trim() || null,
        address: organizationForm.address.trim() || null,
        currency_code: organizationForm.currency_code.trim().toUpperCase(),
      })
      .eq("id", organization.id);

    setSavingOrganization(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    await refreshTenant();
    toast.success("Organization updated");
  };

  const openCreateBranch = () => {
    setEditingBranch(null);
    setBranchForm(emptyBranchForm);
    setBranchDialogOpen(true);
  };

  const openEditBranch = (branch: BranchContext) => {
    setEditingBranch(branch);
    setBranchForm({
      name: branch.name,
      address: branch.address || "",
      phone: branch.phone || "",
      is_active: branch.is_active,
    });
    setBranchDialogOpen(true);
  };

  const saveBranch = async () => {
    if (!organization) return;
    if (!branchForm.name.trim()) {
      toast.error("Branch name is required");
      return;
    }

    const activeBranches = branches.filter((branch) => branch.is_active);
    if (editingBranch?.is_active && !branchForm.is_active && activeBranches.length <= 1) {
      toast.error("At least one active branch is required");
      return;
    }

    setSavingBranch(true);
    const payload = {
      organization_id: organization.id,
      name: branchForm.name.trim(),
      address: branchForm.address.trim() || null,
      phone: branchForm.phone.trim() || null,
      is_active: branchForm.is_active,
    };

    const { error } = editingBranch
      ? await supabase.from("branches").update(payload).eq("id", editingBranch.id)
      : await supabase.from("branches").insert(payload);

    setSavingBranch(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    setBranchDialogOpen(false);
    await refreshTenant();
    toast.success(editingBranch ? "Branch updated" : "Branch created");
  };

  if (!organization) {
    return <div className="p-6 text-sm text-muted-foreground">Organization unavailable</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Organization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input id="org-name" value={organizationForm.name} onChange={(e) => setOrganizationForm({ ...organizationForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-currency">Currency</Label>
              <Input id="org-currency" maxLength={3} value={organizationForm.currency_code} onChange={(e) => setOrganizationForm({ ...organizationForm, currency_code: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-email">Contact Email</Label>
              <Input id="org-email" type="email" value={organizationForm.contact_email} onChange={(e) => setOrganizationForm({ ...organizationForm, contact_email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-phone">Phone</Label>
              <Input id="org-phone" value={organizationForm.phone} onChange={(e) => setOrganizationForm({ ...organizationForm, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-address">Address</Label>
            <Input id="org-address" value={organizationForm.address} onChange={(e) => setOrganizationForm({ ...organizationForm, address: e.target.value })} />
          </div>
          <Button className="gap-2" onClick={saveOrganization} disabled={savingOrganization}>
            <Save className="h-4 w-4" />
            {savingOrganization ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Branches</h2>
        <Button className="gap-2" onClick={openCreateBranch}>
          <Plus className="h-4 w-4" />
          Branch
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span className="truncate">{branch.name}</span>
                <Badge variant={branch.is_active ? "default" : "secondary"}>{branch.is_active ? "Active" : "Inactive"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <p>{branch.phone || "No phone"}</p>
                <p>{branch.address || "No address"}</p>
              </div>
              {branch.id === activeBranchId && <Badge variant="outline">Current</Badge>}
              <Separator />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => openEditBranch(branch)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Edit Branch" : "New Branch"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Name</Label>
              <Input id="branch-name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-phone">Phone</Label>
              <Input id="branch-phone" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">Address</Label>
              <Input id="branch-address" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="branch-active" className="cursor-pointer">Active</Label>
              <Switch id="branch-active" checked={branchForm.is_active} onCheckedChange={(checked) => setBranchForm({ ...branchForm, is_active: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveBranch} disabled={savingBranch}>{savingBranch ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
