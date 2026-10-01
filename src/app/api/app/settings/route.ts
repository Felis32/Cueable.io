import { createClient } from "@/lib/supabase/server";

const themes = ["light", "dark"] as const;
const landingPages = ["home", "compose"] as const;

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : null;
}

function validImageUrl(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: Response.json({ error: "Sign in to manage settings." }, { status: 401 }) };
  return { supabase, user };
}

export async function GET() {
  const context = await authenticatedClient();
  if ("error" in context) return context.error;

  const [profileResult, userSettingsResult, workspaceResult] = await Promise.all([
    context.supabase.from("profiles").select("full_name, phone, avatar_url, email").eq("id", context.user.id).maybeSingle(),
    context.supabase.from("user_settings").select("timezone, language, theme, default_landing_page").eq("user_id", context.user.id).maybeSingle(),
    context.supabase.from("workspace_settings").select("name, slug, logo_url").eq("user_id", context.user.id).maybeSingle(),
  ]);
  const failed = [profileResult.error, userSettingsResult.error, workspaceResult.error].find(Boolean);
  if (failed) {
    const missingSettingsTable = failed.code === "42P01" || failed.code === "PGRST205";
    return Response.json({
      error: missingSettingsTable ? "General settings storage is not installed yet. Apply the latest Supabase migration." : "Unable to load settings.",
    }, { status: 500 });
  }

  return Response.json({
    profile: {
      name: profileResult.data?.full_name ?? context.user.user_metadata?.full_name ?? context.user.user_metadata?.name ?? "",
      email: profileResult.data?.email ?? context.user.email ?? "",
      phone: profileResult.data?.phone ?? "",
      avatarUrl: profileResult.data?.avatar_url ?? null,
    },
    userSettings: {
      timezone: userSettingsResult.data?.timezone ?? "UTC",
      language: userSettingsResult.data?.language ?? "en",
      theme: userSettingsResult.data?.theme === "dark" ? "dark" : "light",
      defaultLandingPage: userSettingsResult.data?.default_landing_page ?? "home",
    },
    hasUserSettings: Boolean(userSettingsResult.data),
    workspace: {
      name: workspaceResult.data?.name ?? "Cueable studio",
      slug: workspaceResult.data?.slug ?? "",
      logoUrl: workspaceResult.data?.logo_url ?? null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const context = await authenticatedClient();
  if ("error" in context) return context.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  if (Object.keys(body).length === 1 && Object.hasOwn(body, "avatarUrl")) {
    const avatarUrl = validImageUrl(body.avatarUrl);
    if (typeof avatarUrl !== "string") return Response.json({ error: "Choose a valid profile image." }, { status: 400 });
    const { error } = await context.supabase.from("profiles").upsert({
      id: context.user.id,
      email: context.user.email ?? null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) return Response.json({ error: "Unable to save your avatar." }, { status: 500 });
    const { error: authError } = await context.supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
    if (authError) return Response.json({ error: "Avatar saved, but your sign-in profile could not be updated." }, { status: 502 });
    return Response.json({ ok: true });
  }

  if (Object.keys(body).length === 1 && Object.hasOwn(body, "language")) {
    const language = textValue(body.language, 16);
    if (!language || !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language)) {
      return Response.json({ error: "Choose a valid interface language." }, { status: 400 });
    }
    const { error } = await context.supabase.from("user_settings").upsert({
      user_id: context.user.id,
      language,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return Response.json({ error: "Unable to save your interface language." }, { status: 500 });
    return Response.json({ ok: true });
  }

  const profile = body.profile && typeof body.profile === "object" ? body.profile as Record<string, unknown> : null;
  const userSettings = body.userSettings && typeof body.userSettings === "object" ? body.userSettings as Record<string, unknown> : null;
  const workspace = body.workspace && typeof body.workspace === "object" ? body.workspace as Record<string, unknown> : null;
  if (!profile || !userSettings || !workspace) return Response.json({ error: "Complete all General settings before saving." }, { status: 400 });

  const name = textValue(profile.name, 100);
  const phone = textValue(profile.phone, 32);
  const avatarUrl = validImageUrl(profile.avatarUrl);
  const workspaceName = textValue(workspace.name, 80);
  const slugValue = textValue(workspace.slug, 50)?.toLowerCase() ?? "";
  const logoUrl = validImageUrl(workspace.logoUrl);
  const timezone = textValue(userSettings.timezone, 100);
  const language = textValue(userSettings.language, 16);

  if (!name) return Response.json({ error: "Your name is required." }, { status: 400 });
  if (!workspaceName) return Response.json({ error: "Workspace name is required." }, { status: 400 });
  if (slugValue && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugValue)) {
    return Response.json({ error: "Use lowercase letters, numbers, and single hyphens for the workspace URL." }, { status: 400 });
  }
  if (avatarUrl === undefined || logoUrl === undefined) return Response.json({ error: "Profile and workspace logos must be valid image URLs." }, { status: 400 });
  if (!timezone || !isValidTimezone(timezone) || !language || !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language)) {
    return Response.json({ error: "Choose a valid timezone and interface language." }, { status: 400 });
  }
  if (!themes.includes(userSettings.theme as (typeof themes)[number]) || !landingPages.includes(userSettings.defaultLandingPage as (typeof landingPages)[number])) {
    return Response.json({ error: "Choose a valid appearance and landing page." }, { status: 400 });
  }

  const [profileResult, userSettingsResult, workspaceResult] = await Promise.all([
    context.supabase.from("profiles").upsert({
      id: context.user.id,
      email: context.user.email ?? null,
      full_name: name,
      phone: phone || null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" }),
    context.supabase.from("user_settings").upsert({
      user_id: context.user.id,
      timezone,
      language,
      theme: userSettings.theme,
      default_landing_page: userSettings.defaultLandingPage,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }),
    context.supabase.from("workspace_settings").upsert({
      user_id: context.user.id,
      name: workspaceName,
      slug: slugValue || null,
      logo_url: logoUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }),
  ]);
  const failedWrite = [
    { label: "profile", error: profileResult.error, migration: "202609280002_profiles_auth.sql" },
    { label: "personal preferences", error: userSettingsResult.error, migration: "202609300001_settings_general.sql" },
    { label: "workspace", error: workspaceResult.error, migration: "202609300001_settings_general.sql" },
  ].find((write) => write.error);
  if (failedWrite?.error) {
    if (failedWrite.error.code === "23505" && failedWrite.label === "workspace") {
      return Response.json({ error: "That workspace URL is already in use." }, { status: 409 });
    }
    if (failedWrite.error.code === "42P01" || failedWrite.error.code === "PGRST205") {
      return Response.json({ error: `The ${failedWrite.label} table is missing. Apply ${failedWrite.migration}.` }, { status: 500 });
    }
    if (failedWrite.error.code === "42501") {
      return Response.json({ error: `Supabase denied the ${failedWrite.label} save. Check the authenticated-user grants and RLS policy in ${failedWrite.migration}.` }, { status: 403 });
    }
    if (failedWrite.label === "profile" && failedWrite.error.code === "23502" && failedWrite.error.message.includes("Email_id")) {
      return Response.json({ error: "Your profiles table has a required legacy Email_id column. Apply 202609300002_settings_profile_compatibility.sql, then retry." }, { status: 500 });
    }
    return Response.json({ error: `Unable to save ${failedWrite.label} settings: ${failedWrite.error.message.slice(0, 240)}` }, { status: 500 });
  }

  const { error: authError } = await context.supabase.auth.updateUser({ data: { full_name: name } });
  if (authError) return Response.json({ error: "Settings saved, but your sign-in profile could not be updated." }, { status: 502 });
  return Response.json({ ok: true });
}