import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canManageAdmins } from "@/lib/permissions";
import type { AdminLevel } from "@/lib/permissions";
import { useProfileRealtime } from "@/hooks/useRealtimeSubscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Shield, ShieldCheck, ShieldX, User, Mail, Phone, Calendar, Sliders, Circle, UserPlus } from "lucide-react";
import { withLoading, handleError, handleSuccess } from "@/lib/api";
import { LoadingGrid, EmptyState } from "@/components/LoadingGrid";
import { formatDateTime, formatRelativeTime } from "@/lib/formatters";

type InviteAdminLevel = Exclude<AdminLevel, null>;

interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
  is_admin: boolean;
  admin_level: AdminLevel;
  branch_id: string | null;
  branch_name: string | null;
  // Admin presence fields from admin_profiles view
  last_seen_at: string | null;
  is_online: boolean | null;
}

function isMessagePayload(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (typeof error === "object" && error !== null && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json();
        if (isMessagePayload(payload)) return payload.message;
      } catch {
        return fallback;
      }
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function Profiles() {
  const { adminLevel: currentAdminLevel, organization, branches } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    level: "low" as InviteAdminLevel,
    branch_id: "",
  });
  const [inviting, setInviting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editLevelId, setEditLevelId] = useState<string | null>(null);
  const [editLevelName, setEditLevelName] = useState("");
  const [editLevel, setEditLevel] = useState<AdminLevel>('low');
  const [editBranchId, setEditBranchId] = useState<string>("");
  const [revokeAdminId, setRevokeAdminId] = useState<string | null>(null);
  const [revokeAdminName, setRevokeAdminName] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
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

      // Fetch all admins with presence info from admin_profiles view
      const { data: adminsData, error: adminsError } = await supabase
        .from("admin_profiles")
        .select("id, level, branch_id, branch_name, last_seen_at, is_online");

      if (adminsError) {
        handleError(adminsError, "Failed to load admin data");
        return;
      }

      const adminMap = new Map(
        adminsData?.map(a => [
          a.id,
          {
            level: a.level as AdminLevel,
            branch_id: a.branch_id as string | null,
            branch_name: a.branch_name as string | null,
            last_seen_at: a.last_seen_at as string | null,
            is_online: a.is_online as boolean | null,
          },
        ]) || []
      );

      const combinedProfiles: Profile[] = (profilesData || []).map(p => {
        const adminData = adminMap.get(p.id);
        return {
          ...p,
          organization_id: p.organization_id || organization?.id || "",
          is_admin: !!adminData,
          admin_level: adminData?.level || null,
          branch_id: adminData?.branch_id || null,
          branch_name: adminData?.branch_name || null,
          last_seen_at: adminData?.last_seen_at || null,
          is_online: adminData?.is_online || null,
        };
      });

      setProfiles(combinedProfiles);
    });
  }, [organization?.id]);

  useEffect(() => { load(); }, [load]);

  // Subscribe to real-time updates for profile and admin changes
  useProfileRealtime({
    onChange: load,
  });

  const getDefaultBranchId = () => branches.find((branch) => branch.is_active)?.id || "";

  const openInviteDialog = () => {
    setInviteForm({
      full_name: "",
      email: "",
      phone: "",
      level: "low",
      branch_id: getDefaultBranchId(),
    });
    setInviteDialogOpen(true);
  };

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

  const handleInviteAdmin = async () => {
    if (!canManageAdmins(currentAdminLevel)) {
      toast.error("Only high admins can invite admins");
      return;
    }

    if (!organization) {
      toast.error("Organization is required");
      return;
    }

    if (!inviteForm.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }

    if (!inviteForm.email.trim()) {
      toast.error("Email is required");
      return;
    }

    if (inviteForm.level !== "high" && !inviteForm.branch_id) {
      toast.error("Branch assignment is required for medium and low admins");
      return;
    }

    try {
      setInviting(true);

      const { error } = await supabase.functions.invoke("invite-admin", {
        body: {
          email: inviteForm.email.trim(),
          full_name: inviteForm.full_name.trim(),
          phone: inviteForm.phone.trim() || null,
          level: inviteForm.level,
          branch_id: inviteForm.level === "high" ? null : inviteForm.branch_id,
          redirect_to: `${window.location.origin}/accept-invite`,
        },
      });

      if (error) {
        toast.error(await getFunctionErrorMessage(error, "Failed to send invite"));
      } else {
        handleSuccess("Invite sent");
        setInviteDialogOpen(false);
        load();
      }
    } catch (error) {
      toast.error(await getFunctionErrorMessage(error, "Failed to send invite"));
    } finally {
      setInviting(false);
    }
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

  const handlePromoteToAdmin = async () => {
    if (!editLevelId) return;
    if (!organization) {
      toast.error("Organization is required");
      return;
    }
    if (editLevel !== 'high' && !editBranchId) {
      toast.error("Branch assignment is required for medium and low admins");
      return;
    }

    const { error } = await supabase
      .from("admins")
      .insert({
        id: editLevelId,
        level: editLevel,
        organization_id: organization.id,
        branch_id: editLevel === 'high' ? null : editBranchId,
      });

    if (error) {
      handleError(error, "Failed to grant admin privileges");
    } else {
      handleSuccess(`User promoted to admin (${editLevel})`);
      load();
    }
    setEditLevelId(null);
  };

  const handleRevokeAdmin = async () => {
    if (!revokeAdminId) return;

    const { error } = await supabase
      .from("admins")
      .delete()
      .eq("id", revokeAdminId);

    if (error) {
      handleError(error, "Failed to remove admin privileges");
    } else {
      handleSuccess("Admin privileges removed");
      load();
    }
    setRevokeAdminId(null);
  };

  const handleUpdateAdminLevel = async () => {
    if (!editLevelId) return;
    if (!organization) {
      toast.error("Organization is required");
      return;
    }
    if (editLevel !== 'high' && !editBranchId) {
      toast.error("Branch assignment is required for medium and low admins");
      return;
    }

    const { error } = await supabase
      .from("admins")
      .update({
        level: editLevel,
        organization_id: organization.id,
        branch_id: editLevel === 'high' ? null : editBranchId,
      })
      .eq("id", editLevelId);

    if (error) {
      handleError(error, "Failed to update admin level");
    } else {
      handleSuccess("Admin level updated");
      load();
    }
    setEditLevelId(null);
  };

  const confirmEditLevel = (profile: Profile) => {
    setEditLevelId(profile.id);
    setEditLevelName(profile.full_name);
    setEditLevel(profile.admin_level || 'low');
    setEditBranchId(profile.branch_id || branches.find((branch) => branch.is_active)?.id || "");
  };

  const confirmRevokeAdmin = (profile: Profile) => {
    setRevokeAdminId(profile.id);
    setRevokeAdminName(profile.full_name);
  };

  const confirmPromoteToAdmin = (profile: Profile) => {
    setEditLevelId(profile.id);
    setEditLevelName(profile.full_name);
    setEditLevel(profile.admin_level || 'low');
    setEditBranchId(profile.branch_id || branches.find((branch) => branch.is_active)?.id || "");
  };

  const getRoleBadge = (profile: Profile) => {
    if (profile.is_admin) {
      const levelLabel = profile.admin_level ? ` · ${profile.admin_level.charAt(0).toUpperCase() + profile.admin_level.slice(1)}` : '';
      const branchLabel = profile.branch_name ? ` · ${profile.branch_name}` : '';
      return <Badge variant="default" className="bg-primary"><Shield className="h-3 w-3 mr-1" /> Admin{levelLabel}{branchLabel}</Badge>;
    }
    return <Badge variant="secondary"><User className="h-3 w-3 mr-1" /> Customer</Badge>;
  };

  // Get presence indicator for admin status column
  const getPresenceIndicator = (profile: Profile) => {
    if (!profile.is_admin) return null;

    if (profile.is_online) {
      return (
        <div className="flex items-center gap-1.5 text-green-600">
          <Circle className="h-2.5 w-2.5 fill-current" />
          <span className="text-xs font-medium">Online</span>
        </div>
      );
    }

    if (profile.last_seen_at) {
      return (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Circle className="h-2.5 w-2.5 fill-current opacity-50" />
          <span className="text-xs">Last seen {formatRelativeTime(profile.last_seen_at)}</span>
        </div>
      );
    }

    // Never seen (null last_seen_at)
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Circle className="h-2.5 w-2.5 fill-current opacity-50" />
        <span className="text-xs">Never seen</span>
      </div>
    );
  };

  const filtered = profiles.filter(p => {
    // Search filter
    const matchesSearch = 
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone && p.phone.toLowerCase().includes(search.toLowerCase()));
    
    // Role filter
    let matchesRole = true;
    if (filterRole === "admin") matchesRole = p.is_admin;
    else if (filterRole === "customer") matchesRole = !p.is_admin;
    
    // Online filter (only applies to admins)
    const matchesOnline = !filterOnlineOnly || (p.is_admin && p.is_online);
    
    return matchesSearch && matchesRole && matchesOnline;
  });

  return (
    <div className="p-4 md:p-6">
      {/* Search bar row */}
      <div className="sticky top-[48px] z-10 bg-background py-2">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search by name, email or phone..." 
              className="pl-9" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
          </div>
          {canManageAdmins(currentAdminLevel) && (
            <Button onClick={openInviteDialog} className="shrink-0">
              <UserPlus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Invite Admin</span>
              <span className="sm:hidden">Invite</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="sticky top-[96px] z-10 bg-background py-2">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger>
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Online only</span>
            <Switch
              checked={filterOnlineOnly}
              onCheckedChange={setFilterOnlineOnly}
            />
          </div>
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
                        {profile.is_admin && (
                          <div className="mt-1.5">
                            {getPresenceIndicator(profile)}
                          </div>
                        )}
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
                      <>
                        {profile.is_admin ? (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => { e.stopPropagation(); confirmEditLevel(profile); }}
                              title="Edit admin level"
                            >
                              <Sliders className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => { e.stopPropagation(); confirmRevokeAdmin(profile); }}
                              title="Remove admin privileges"
                            >
                              <ShieldX className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => { e.stopPropagation(); confirmPromoteToAdmin(profile); }}
                            title="Promote to admin"
                          >
                            <ShieldCheck className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                      </>
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

      {/* Invite Admin Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Invite Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inviteFullName">Full Name</Label>
              <Input
                id="inviteFullName"
                value={inviteForm.full_name}
                onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inviteEmail">Email</Label>
              <Input
                id="inviteEmail"
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="admin@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invitePhone">Phone</Label>
              <Input
                id="invitePhone"
                type="tel"
                value={inviteForm.phone}
                onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Admin Level</Label>
              <Select
                value={inviteForm.level}
                onValueChange={(value) => {
                  const level = value as InviteAdminLevel;
                  setInviteForm({
                    ...inviteForm,
                    level,
                    branch_id: level === "high" ? "" : inviteForm.branch_id || getDefaultBranchId(),
                  });
                }}
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
            {inviteForm.level !== "high" && (
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={inviteForm.branch_id}
                  onValueChange={(branch_id) => setInviteForm({ ...inviteForm, branch_id })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.filter((branch) => branch.is_active).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)} disabled={inviting}>
              Cancel
            </Button>
            <Button onClick={handleInviteAdmin} disabled={inviting}>
              {inviting ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
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

      {/* Promote to Admin Dialog */}
      <AlertDialog open={!!editLevelId && !profiles.find(p => p.id === editLevelId)?.is_admin} onOpenChange={() => setEditLevelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Admin?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to promote {editLevelName} to admin? They will have access based on the selected level.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Label className="mb-2 block">Admin Level</Label>
            <Select 
              value={editLevel || 'low'} 
              onValueChange={(v) => setEditLevel(v as AdminLevel)}
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
            {editLevel !== 'high' && (
              <div className="mt-4">
                <Label className="mb-2 block">Branch</Label>
                <Select value={editBranchId} onValueChange={setEditBranchId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.filter((branch) => branch.is_active).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEditLevelId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromoteToAdmin}>
              Promote to Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Admin Level Dialog */}
      <AlertDialog open={!!editLevelId && profiles.find(p => p.id === editLevelId)?.is_admin === true} onOpenChange={() => setEditLevelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Admin Level</AlertDialogTitle>
            <AlertDialogDescription>
              Change the admin level for {editLevelName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Label className="mb-2 block">Admin Level</Label>
            <Select 
              value={editLevel || 'low'} 
              onValueChange={(v) => setEditLevel(v as AdminLevel)}
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
            {editLevel !== 'high' && (
              <div className="mt-4">
                <Label className="mb-2 block">Branch</Label>
                <Select value={editBranchId} onValueChange={setEditBranchId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.filter((branch) => branch.is_active).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEditLevelId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateAdminLevel}>
              Update Level
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Admin Confirmation */}
      <AlertDialog open={!!revokeAdminId} onOpenChange={() => setRevokeAdminId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Admin Privileges?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove admin privileges from {revokeAdminName}? They will no longer have access to the admin dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRevokeAdminId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRevokeAdmin}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
