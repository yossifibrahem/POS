import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function AcceptInvite() {
  const { user, loading, adminLoading } = useAuth();
  const checkAdminAndNavigate = useAdminCheck();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorDescription = params.get("error_description") || hashParams.get("error_description");
    const errorCode = params.get("error") || hashParams.get("error");

    if (errorDescription || errorCode) {
      setLinkError(errorDescription || "This invite link is invalid or expired.");
    }
  }, []);

  const handleSetPassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      toast.error("Open the latest invite email link before setting a password");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success("Password set successfully");
    await checkAdminAndNavigate(user.id);
    setSaving(false);
  };

  const waitingForSession = loading || adminLoading;
  const hasInvalidLink = !waitingForSession && !user;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Accept Invitation</CardTitle>
          <CardDescription>Set a password to finish creating your admin account</CardDescription>
        </CardHeader>
        {waitingForSession ? (
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">Checking invite link...</p>
          </CardContent>
        ) : hasInvalidLink ? (
          <>
            <CardContent>
              <p className="text-center text-sm text-muted-foreground">
                {linkError || "This invite link is invalid or expired."}
              </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button asChild className="w-full">
                <Link to="/login">Go to Sign In</Link>
              </Button>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={handleSetPassword}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving password..." : "Set Password"}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
