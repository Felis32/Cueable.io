import { redirect } from "next/navigation";
import { AdminRequestDetail } from "@/components/admin/AdminRequestDetail";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/");

  const { id } = await params;
  return <AdminRequestDetail requestId={id} />;
}
