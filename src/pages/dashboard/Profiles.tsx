import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canManageAdmins } from "@/lib/permissions";
import type { AdminLevel } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Shield, ShieldCheck, ShieldX, User, Users, Mail, Phone, Calendar } from "lucide-react";
import { withLoading, handleError, handleSuccess } from "@/lib/api";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";
import { formatDateTime } from "@/lib/formatters";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
  is_admin: boolean;
  is_customer: boolean;
  admin_level: AdminLevel;
}

export default function Profiles() {
  const { adminLevel: currentAdminLevel } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toggleAdminId, setToggleAdminId] = useState<string | null>(null);
  const [toggleAdminName, setToggleAdminName] = useState("");
  const [toggleAdminCurrentStatus, setToggleAdminCurrentStatus] = useState(false);
  const [toggleAdminLevel, setToggleAdminLevel] = useState<AdminLevel>('low');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    await withLoading(setLoading, async () => {
      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) {
        handleError(profilesError, "Failed to load profiles");
        return;
      }

      // Fetch all admins to determine admin status and level
      const { data: adminsData, error: adminsError } = await supabase
        .from("admins")
        .select("id, level");

      if (adminsError) {
        handleError(adminsError, "Failed to load admin data");
        return;
      }

      // Fetch all customers to determine customer status
      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id");

      if (customersError) {
        handleError(customersError, "Failed to load customer data");
        return;
      }

      const adminMap = new Map(adminsData?.map(a => [a.id, a.level as AdminLevel]) || []);
      const customerIds = new Set(customersData?.map(c => c.id) || []);

      const combinedProfiles: Profile[] = (profilesData || []).map(p => ({
        ...p,
        is_admin: adminMap.has(p.id),
        is_customer: customerIds.has(p.id),
        admin_level: adminMap.get(p.id) || null,
      }));

      setProfiles(combinedProfiles);
    });
  };

  useEffect(() => { load(); }, []);

  const openEdit = (p: Profile) => {
    setEditing(p);
    setForm({ full_name: p.full_name, email: p.email, phone: p.phone || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    
    if (!form.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }

    if (!form.email.trim()) {
      toast.error("Email is required");
      return;
    }

    setSaving(true);

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
    };

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", editing.id);

    if (error) {
      handleError(error, "Failed to update profile");
    } else {
      handleSuccess("Profile updated successfully");
      setDialogOpen(false);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    // Note: Deleting from profiles will cascade to auth.users due to FK constraint
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", deleteId);

    if (error) {
      handleError(error, "Failed to delete profile");
    } else {
      handleSuccess("Profile deleted successfully");
      load();
    }
    setDeleteId(null);
  };

  const handleToggleAdmin = async () => {
    if (!toggleAdminId) return;

    if (toggleAdminCurrentStatus) {
      // Remove from admins (demote)
      const { error } = await supabase
        .from("admins")
        .delete()
        .eq("id", toggleAdminId);

      if (error) {
        handleError(error, "Failed to remove admin privileges");
      } else {
        handleSuccess("Admin privileges removed");
        load();
      }
    } else {
      // Add to admins (promote) with selected level
      const { error } = await supabase
        .from("admins")
        .insert({ id: toggleAdminId, level: toggleAdminLevel });

      if (error) {
        handleError(error, "Failed to grant admin privileges");
      } else {
        handleSuccess(`User promoted to admin (${toggleAdminLevel})`);
        load();
      }
    }
    setToggleAdminId(null);
  };

  const handleUpdateAdminLevel = async (profileId: string, newLevel: AdminLevel) => {
    const { error } = await supabase
      .from("admins")
      .update({ level: newLevel })
      .eq("id", profileId);

    if (error) {
      handleError(error, "Failed to update admin level");
    } else {
      handleSuccess("Admin level updated");
      load();
    }
  };

  const confirmToggleAdmin = (profile: Profile) => {
    setToggleAdminId(profile.id);
    setToggleAdminName(profile.full_name);
    setToggleAdminCurrentStatus(profile.is_admin);
    setToggleAdminLevel(profile.admin_level || 'low');
  };

  const getRoleBadge = (profile: Profile) => {
    if (profile.is_admin) {
      const levelLabel = profile.admin_level ? ` · ${profile.admin_level.charAt(0).toUpperCase() + profile.admin_level.slice(1)}` : '';
      return <Badge variant="default" className="bg-primary"><Shield className="h-3 w-3 mr-1" /> Admin{levelLabel}</Badge>;
    }
    if (profile.is_customer) {
      return <Badge variant="secondary"><User className="h-3 w-3 mr-1" /> Customer</Badge>;
    }
    return <Badge variant="outline">User</Badge>;
  };

  const filtered = profiles.filter(p => 
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone && p.phone.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-6">
      <div className="sticky top-[48px] z-10 flex items-center justify-between bg-background py-2">
        <div>
          <h1 className="text-2xl font-bold">Profiles</h1>
          <p className="text-sm text-muted-foreground">Manage user profiles and admin roles</p>
        </div>
      </div>

      {/* Search bar row */}
      <div className="sticky top-[96px] z-10 bg-background py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search by name, email or phone..." 
            className="pl-9" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
      </div>

      <div className="pt-4 pb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <LoadingGrid count={6} columns={3} />
          ) : filtered.length > 0 ? (
            filtered.map((profile) => (
              <Card 
                key={profile.id} 
                className="cursor-pointer transition hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-medium">{profile.full_name}</CardTitle>
                        <div className="mt-1">{getRoleBadge(profile)}</div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{profile.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{profile.phone || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDateTime(profile.created_at)}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-end gap-1">
                    {canManageAdmins(currentAdminLevel) && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={(e) => { e.stopPropagation(); confirmToggleAdmin(profile); }}
                        title={profile.is_admin ? "Remove admin privileges" : "Promote to admin"}
                      >
                        {profile.is_admin ? (
                          <ShieldX className="h-4 w-4 text-destructive" />
                        ) : (
                          <ShieldCheck className="h-4 w-4 text-primary" />
                        )}
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e) => { e.stopPropagation(); openEdit(profile); }}
                      title="Edit profile"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e) => { e.stopPropagation(); setDeleteId(profile.id); }}
                      title="Delete profile"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState message="No profiles found" />
          )}
        </div>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input 
                value={form.full_name} 
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email"
                value={form.email} 
                onChange={(e) => setForm({ ...form, email: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input 
                value={form.phone} 
                onChange={(e) => setForm({ ...form, phone: e.target.value })} 
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user account and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toggle Admin Confirmation */}
      <AlertDialog open={!!toggleAdminId} onOpenChange={() => setToggleAdminId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleAdminCurrentStatus ? "Remove Admin Privileges?" : "Promote to Admin?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleAdminCurrentStatus 
                ? `Are you sure you want to remove admin privileges from ${toggleAdminName}? They will no longer have access to the admin dashboard.`
                : `Are you sure you want to promote ${toggleAdminName} to admin? They will have access based on the selected level.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {/* Level selector for promotion - only for high admins */}
          {!toggleAdminCurrentStatus && canManageAdmins(currentAdminLevel) && (
            <div className="py-4">
              <Label className="mb-2 block">Admin Level</Label>
              <Select 
                value={toggleAdminLevel || 'low'} 
                onValueChange={(v) => setToggleAdminLevel(v as AdminLevel)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select level..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High - Full Access</SelectItem>
                  <SelectItem value="med">Med - No Cost/Profit View</SelectItem>
                  <SelectItem value="low">Low - Sales Only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Default is Low. Only High admins can change levels.
              </p>
            </div>
          )}
          
          {/* Level editor for existing admins - only for high admins */}
          {toggleAdminCurrentStatus && canManageAdmins(currentAdminLevel) && (
            <div className="py-4">
              <Label className="mb-2 block">Admin Level</Label>
              <Select 
                value={toggleAdminLevel || 'low'} 
                onValueChange={(v) => setToggleAdminLevel(v as AdminLevel)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select level..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High - Full Access</SelectItem>
                  <SelectItem value="med">Med - No Cost/Profit View</SelectItem>
                  <SelectItem value="low">Low - Sales Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setToggleAdminId(null)}>Cancel</AlertDialogCancel>
            {toggleAdminCurrentStatus && canManageAdmins(currentAdminLevel) ? (
              <>
                <AlertDialogAction 
                  onClick={() => toggleAdminId && handleUpdateAdminLevel(toggleAdminId, toggleAdminLevel)}
                >
                  Update Level
                </AlertDialogAction>
                <AlertDialogAction 
                  onClick={handleToggleAdmin}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Revoke Admin
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={handleToggleAdmin}>
                {toggleAdminCurrentStatus ? "Remove Admin" : "Promote to Admin"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
