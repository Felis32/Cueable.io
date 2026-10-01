import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function syncAuthProfile(user: User) {
  try {
    const admin = createAdminClient();
    const profile = {
      id: user.id,
      email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
      phone: user.phone ?? null,
      updated_at: new Date().toISOString(),
      ...(typeof user.user_metadata?.avatar_url === "string" ? { avatar_url: user.user_metadata.avatar_url } : {}),
    };
    const { error } = await admin.from("profiles").upsert(profile, { onConflict: "id" });

    if (error) console.error("Unable to sync auth profile:", error.message);
  } catch (error) {
    console.error("Unable to sync auth profile:", error);
  }
}