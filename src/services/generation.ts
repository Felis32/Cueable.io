"use server";

import { notifyAdminsOfNewProject } from "@/lib/admin-notifications";
import { createClient } from "@/lib/supabase/server";

export type GenerationInput = {
  mode: "prompt" | "url" | "assets";
  prompt: string;
  url: string;
  ratio: string;
  duration: string;
  assetUrls?: string[];
};

export async function requestGeneration(input: GenerationInput) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be logged in to create a project.");
  }

  const promptText = (input.prompt || "").trim();
  const urlText = (input.url || "").trim();
  const assetUrls = (input.assetUrls ?? []).filter(Boolean);
  const briefText = [
    promptText,
    assetUrls.length ? `Uploaded assets:\n${assetUrls.join("\n")}` : "",
    `[Ratio: ${input.ratio}] [Duration: ${input.duration}]`,
  ].filter(Boolean).join("\n\n");
  const projectName = briefText
    ? briefText.split("\n")[0].slice(0, 80)
    : urlText
      ? urlText.replace(/^https?:\/\//, "").slice(0, 80)
      : "Untitled project";

  const { data, error } = await supabase
    .from("projects")
    .insert([
      {
        user_id: user.id,
        name: projectName,
        source_type: input.mode,
        source_url: urlText || null,
        prompt: briefText,
        status: "pending",
      },
    ])
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message || "Unable to create your project.");
  }

  await notifyAdminsOfNewProject({
    projectId: data.id,
    projectName,
    sourceType: input.mode,
    brief: promptText || urlText || "Uploaded assets",
  });

  return {
    projectId: data.id,
    preview: true,
    echo: promptText || urlText || "Uploaded assets",
  };
}
