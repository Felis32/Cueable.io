import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { syncAuthProfile } from "@/lib/profile-sync";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const cookieStore = await cookies();
  const authIntent = cookieStore.get("primecut-auth-intent")?.value;

  if (searchParams.has("error")) {
    const [intent] = authIntent?.split(":") ?? [];
    cookieStore.delete("primecut-auth-intent");
    return NextResponse.redirect(`${origin}${intent === "signup" ? "/signup" : "/login"}?error=oauth`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      const [intent, startedAtValue] = authIntent?.split(":") ?? [];
      const startedAt = Number(startedAtValue);
      const createdAt = Date.parse(user?.created_at ?? "");
      const hasFlowTimestamp = Number.isFinite(startedAt) && Number.isFinite(createdAt);
      const createdDuringFlow = hasFlowTimestamp && createdAt >= startedAt - 2000;

      cookieStore.delete("primecut-auth-intent");

      if (intent === "signup" && hasFlowTimestamp && !createdDuringFlow) {
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(`${origin}/signup?auth=account-exists`);
      }

      if (intent === "login" && createdDuringFlow) {
        return NextResponse.redirect(`${origin}/login?auth=google-account-created`);
      }

      if (user) await syncAuthProfile(user);

      let next = requestedNext ?? "/app";
      if (user && !requestedNext) {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("default_landing_page")
          .eq("user_id", user.id)
          .maybeSingle();
        if (settings?.default_landing_page === "compose") next = "/app/compose";
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  cookieStore.delete("primecut-auth-intent");

  // Return the user to login with an error
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
