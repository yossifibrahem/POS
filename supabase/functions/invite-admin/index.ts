import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type AdminLevel = "high" | "med" | "low";
type JsonRecord = Record<string, unknown>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getJsonSecret(envName: string): string | null {
  const raw = Deno.env.get(envName);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const candidate = parsed.default ?? Object.values(parsed).find((value) => typeof value === "string");
    return typeof candidate === "string" && candidate ? candidate : null;
  } catch {
    return null;
  }
}

function getSecret(names: string[], jsonEnvName?: string): string | null {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }

  return jsonEnvName ? getJsonSecret(jsonEnvName) : null;
}

function getConfig() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = getSecret(["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"], "SUPABASE_PUBLISHABLE_KEYS");
  const serviceRoleKey = getSecret(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"], "SUPABASE_SECRET_KEYS");

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    throw new Error("Supabase function environment is not configured");
  }

  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function getStringField(body: JsonRecord, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNullableStringField(body: JsonRecord, key: string): string | null {
  const value = getStringField(body, key);
  return value || null;
}

function parseAdminLevel(value: unknown): AdminLevel | null {
  return value === "high" || value === "med" || value === "low" ? value : null;
}

function isDuplicateInviteError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("already") || lower.includes("duplicate") || lower.includes("registered");
}

async function findAuthUserByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string } | null> {
  const perPage = 1000;
  let page = 1;
  let keepPaging = true;

  while (keepPaging) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data.users ?? [];
    const existingUser = users.find((user) => user.email?.toLowerCase() === email);
    if (existingUser) return { id: existingUser.id };

    keepPaging = users.length === perPage;
    page += 1;
  }

  return null;
}

async function cleanupInvitedUser(supabaseAdmin: ReturnType<typeof createClient>, userId: string) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) console.error("Failed to clean up invited user", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { message: "Method not allowed" });
  }

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Function configuration error";
    return jsonResponse(500, { message });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { message: "Authentication is required" });
  }

  const userClient = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(401, { message: "Authentication is required" });
  }

  const { data: callerAdmin, error: callerError } = await supabaseAdmin
    .from("admins")
    .select("level, organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (callerError) {
    return jsonResponse(500, { message: callerError.message });
  }

  if (!callerAdmin || callerAdmin.level !== "high") {
    return jsonResponse(403, { message: "Only high admins can invite admins" });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(400, { message: "Request body must be valid JSON" });
  }

  if (!isRecord(rawBody)) {
    return jsonResponse(400, { message: "Request body must be an object" });
  }

  const email = getStringField(rawBody, "email").toLowerCase();
  const fullName = getStringField(rawBody, "full_name");
  const phone = getNullableStringField(rawBody, "phone");
  const level = parseAdminLevel(rawBody.level);
  const branchId = getNullableStringField(rawBody, "branch_id");
  const redirectTo = getNullableStringField(rawBody, "redirect_to");

  if (!emailPattern.test(email)) {
    return jsonResponse(400, { message: "Enter a valid email address" });
  }

  if (!fullName) {
    return jsonResponse(400, { message: "Full name is required" });
  }

  if (!level) {
    return jsonResponse(400, { message: "Admin level must be high, med, or low" });
  }

  if (level === "high" && branchId) {
    return jsonResponse(400, { message: "High admins cannot be assigned to a branch" });
  }

  if (level !== "high" && !branchId) {
    return jsonResponse(400, { message: "Branch assignment is required for medium and low admins" });
  }

  if (branchId) {
    const { data: branch, error: branchError } = await supabaseAdmin
      .from("branches")
      .select("id")
      .eq("id", branchId)
      .eq("organization_id", callerAdmin.organization_id)
      .maybeSingle();

    if (branchError) {
      return jsonResponse(500, { message: branchError.message });
    }

    if (!branch) {
      return jsonResponse(400, { message: "Selected branch does not belong to this organization" });
    }
  }

  try {
    const existingUser = await findAuthUserByEmail(supabaseAdmin, email);
    if (existingUser) {
      return jsonResponse(409, { message: "A user with this email already exists" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check existing users";
    return jsonResponse(500, { message });
  }

  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      display_name: fullName,
      phone,
      organization_id: callerAdmin.organization_id,
      invited_by: userData.user.id,
    },
    redirectTo: redirectTo ?? undefined,
  });

  if (inviteError || !inviteData.user) {
    const message = inviteError?.message || "Failed to send invite";
    return jsonResponse(isDuplicateInviteError(message) ? 409 : 400, { message });
  }

  const invitedUserId = inviteData.user.id;
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: invitedUserId,
      full_name: fullName,
      email,
      phone,
      organization_id: callerAdmin.organization_id,
    }, { onConflict: "id" });

  if (profileError) {
    await cleanupInvitedUser(supabaseAdmin, invitedUserId);
    return jsonResponse(500, { message: profileError.message });
  }

  const { error: adminError } = await supabaseAdmin
    .from("admins")
    .upsert({
      id: invitedUserId,
      level,
      organization_id: callerAdmin.organization_id,
      branch_id: level === "high" ? null : branchId,
    }, { onConflict: "id" });

  if (adminError) {
    await cleanupInvitedUser(supabaseAdmin, invitedUserId);
    return jsonResponse(500, { message: adminError.message });
  }

  return jsonResponse(200, {
    id: invitedUserId,
    email,
    level,
    message: "Invite sent",
  });
});
