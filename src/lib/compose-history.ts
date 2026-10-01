"use client";

import { createClient } from "@/lib/supabase/client";
import type { ComposeResponse } from "@/lib/ai/compose-response";
import type { ScenePlan } from "@/lib/ai/scene-plan";

export type ComposeHistoryEntry = {
  id: string;
  threadId: string;
  text: string;
  createdAt: string;
  response?: ComposeResponse | null;
  plan?: ScenePlan | null;
};

export async function loadRemoteComposeHistory(): Promise<ComposeHistoryEntry[] | null> {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    const rows: { id: string; thread_id: string; text: string; response: unknown; plan: unknown; created_at: string }[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase
        .from("compose_history")
        .select("id, thread_id, text, response, plan, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, from + 499);
      if (error || !data) return null;
      rows.push(...data);
      if (data.length < 500) break;
    }

    return rows.map((entry) => ({
      id: entry.id,
      threadId: entry.thread_id,
      text: entry.text,
      createdAt: entry.created_at,
      response: entry.response as ComposeResponse | null,
      plan: entry.plan as ScenePlan | null,
    }));
  } catch {
    return null;
  }
}

export async function saveRemoteComposeHistoryEntry(entry: ComposeHistoryEntry) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return;

    const { error } = await supabase.from("compose_history").insert({
      id: entry.id,
      user_id: user.id,
      thread_id: entry.threadId,
      text: entry.text,
      created_at: entry.createdAt,
      response: entry.response ?? null,
      plan: entry.plan ?? null,
    });
    if (error) console.error("Unable to sync compose history:", error.message);
  } catch (error) {
    console.error("Unable to sync compose history:", error);
  }
}

export async function saveRemoteComposeHistoryResult(
  id: string,
  result: { response?: ComposeResponse; plan?: ScenePlan | null },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return;

    const { error } = await supabase.from("compose_history").update({
      ...(result.response !== undefined ? { response: result.response } : {}),
      ...(result.plan !== undefined ? { plan: result.plan } : {}),
    }).eq("id", id).eq("user_id", user.id);
    if (error) console.error("Unable to sync compose conversation:", error.message);
  } catch (error) {
    console.error("Unable to sync compose conversation:", error);
  }
}