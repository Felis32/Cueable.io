import { createClient } from "@/lib/supabase/server";

function storageError(error: { code?: string }) {
  return Response.json({
    error: error.code === "42P01" || error.code === "PGRST205"
      ? "Ada chat storage is not installed. Apply 202609300004_ada_chat.sql in Supabase."
      : "Unable to load Ada conversations.",
  }, { status: 503 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in to use Ada." }, { status: 401 });

  const threads: { id: string; title: string; updated_at: string }[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from("ada_threads")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(from, from + 499);
    if (error) return storageError(error);
    threads.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }

  const firstMessages = new Map<string, string>();
  for (let offset = 0; offset < threads.length; offset += 100) {
    const ids = threads.slice(offset, offset + 100).map((thread) => thread.id);
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from("ada_messages")
        .select("thread_id, content")
        .eq("user_id", user.id)
        .eq("role", "user")
        .in("thread_id", ids)
        .order("created_at", { ascending: true })
        .range(from, from + 499);
      if (error) return storageError(error);
      for (const message of data ?? []) {
        if (!firstMessages.has(message.thread_id)) firstMessages.set(message.thread_id, message.content);
      }
      if ((data ?? []).length < 500 || ids.every((id) => firstMessages.has(id))) break;
    }
  }

  const titledThreads = threads.map((thread) => ({
    ...thread,
    title: thread.title === "New Ada conversation"
      ? firstMessages.get(thread.id)?.slice(0, 80) || thread.title
      : thread.title,
  }));
  return Response.json({ threads: titledThreads }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in to use Ada." }, { status: 401 });

  const { data, error } = await supabase.from("ada_threads")
    .insert({ user_id: user.id })
    .select("id, title, updated_at")
    .single();
  if (error || !data) return error ? storageError(error) : Response.json({ error: "Unable to start Ada chat." }, { status: 500 });
  return Response.json({ threadId: data.id, title: data.title, updatedAt: data.updated_at, messages: [] }, { status: 201 });
}
