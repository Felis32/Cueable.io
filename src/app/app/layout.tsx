import { AppShell } from "@/components/app/AppShell";
import { AppI18nProvider } from "@/lib/app-i18n";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppI18nProvider>
      <AppShell isAdmin={isAdminEmail(user?.email)}>{children}</AppShell>
    </AppI18nProvider>
  );
}
