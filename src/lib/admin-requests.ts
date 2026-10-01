import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const REQUEST_STATUSES = [
  "new",
  "in_progress",
  "in_review",
  "delivered",
  "revision_requested",
  "completed",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && REQUEST_STATUSES.includes(value as RequestStatus);
}

export async function requireAdminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: Response.json({ error: "Sign in to access admin requests." }, { status: 401 }) };
  }
  if (!isAdminEmail(user.email)) {
    return { ok: false as const, response: Response.json({ error: "Admin access required." }, { status: 403 }) };
  }

  return { ok: true as const, user, admin: createAdminClient() };
}

export async function listAdminUsers(admin: SupabaseClient) {
  const allowlistedEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!allowlistedEmails.size) return [];

  const members: { id: string; email: string; name: string }[] = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return members;

    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (!email || !allowlistedEmails.has(email)) continue;
      members.push({
        id: user.id,
        email: user.email ?? "",
        name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Admin"),
      });
    }

    if (data.users.length < perPage || members.length === allowlistedEmails.size) return members;
  }
}

export async function writeRequestActivity(
  admin: SupabaseClient,
  requestId: string,
  actor: User,
  action: string,
  details: Record<string, unknown> = {},
  fromStatus?: RequestStatus,
  toStatus?: RequestStatus,
) {
  return admin.from("request_activity").insert({
    request_id: requestId,
    actor: actor.id,
    action,
    details,
    from_status: fromStatus ?? null,
    to_status: toStatus ?? null,
  });
}
