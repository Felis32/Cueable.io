type Runtime = typeof globalThis & {
  Deno?: {
    env: { get(name: string): string | undefined };
    readFile(path: URL): Promise<Uint8Array>;
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
  EdgeRuntime?: { waitUntil(task: Promise<unknown>): void };
};

type Scene = {
  sceneNumber: number;
  visualDescription: string;
  onScreenText: string;
  voiceoverLine: string;
  seconds: number;
};

type Job = {
  id: string;
  project_id: string;
  user_id: string;
  attempt_count: number;
  max_attempts: number;
  input: {
    brief: { duration: number };
    variant: { label: string; aspectRatio: string; script: string; scenes: Scene[] };
  };
};

type GenerationInput = {
  brief: Job["input"]["brief"];
  variant: Job["input"]["variant"];
};

type GenerationResult = { bytes: Uint8Array; mimeType: "video/mp4"; model: string; cost: number };

interface GenerationProviderAdapter {
  generate(input: GenerationInput, onSceneProgress: (sceneNumber: number, progress: number) => Promise<void>, signal: AbortSignal): Promise<GenerationResult>;
}

const runtime = globalThis as Runtime;
const mockProvider: GenerationProviderAdapter = {
  async generate(input, onSceneProgress, signal) {
    for (const scene of input.variant.scenes) {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        const timeout = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 300);
        const abort = () => {
          clearTimeout(timeout);
          reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
      });
      await onSceneProgress(scene.sceneNumber, 100);
    }
    const bytes = await runtime.Deno?.readFile(new URL("./mock-preview.mp4", import.meta.url));
    if (!bytes) throw new Error("The mock preview file is unavailable.");
    return {
      bytes,
      mimeType: "video/mp4",
      model: "mock-video-v1",
      cost: 0,
    };
  },
};

function env(name: string) {
  return runtime.Deno?.env.get(name) ?? "";
}

function config() {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Generation worker Supabase credentials are not configured.");
  return { url, key };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = config();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.body && !(init.body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${body.slice(0, 400)}`);
  return (body ? JSON.parse(body) : null) as T;
}

async function patchTable(table: string, filters: string, value: Record<string, unknown>, signal?: AbortSignal) {
  await supabaseRequest(`/rest/v1/${table}?${filters}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(value),
    signal,
  });
}

async function updateProgress(jobId: string, sceneNumber: number, progress: number, sceneCount: number, signal: AbortSignal) {
  const sceneRows = await supabaseRequest<{ id: string }[]>(`/rest/v1/generation_scenes?job_id=eq.${jobId}&scene_number=eq.${sceneNumber}&select=id`, { signal });
  if (sceneRows[0]) {
    await patchTable("generation_scenes", `id=eq.${sceneRows[0].id}`, { status: progress >= 100 ? "done" : "running", progress, updated_at: new Date().toISOString() }, signal);
  }
  const doneCount = Math.min(sceneNumber, sceneCount);
  const overallProgress = Math.min(88, Math.floor((doneCount / sceneCount) * 88));
  await patchTable("generation_jobs", `id=eq.${jobId}`, { progress: overallProgress, updated_at: new Date().toISOString() }, signal);
}

async function finishJob(job: Job, result: GenerationResult, signal: AbortSignal) {
  const { url, key } = config();
  const path = `${job.project_id}/generation/${job.id}/mock-preview.mp4`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const upload = await fetch(`${url}/storage/v1/object/videos/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": result.mimeType,
      "x-upsert": "true",
    },
    body: new Blob([result.bytes.buffer as ArrayBuffer]),
    signal,
  });
  if (!upload.ok) throw new Error(`Unable to store the generated video (${upload.status}).`);

  const existingVideos = await supabaseRequest<{ id: string }[]>(`/rest/v1/videos?project_id=eq.${job.project_id}&storage_path=eq.${encodeURIComponent(path)}&select=id&limit=1`, { signal });
  if (!existingVideos?.length) {
    await supabaseRequest("/rest/v1/videos", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        project_id: job.project_id,
        user_id: job.user_id,
        title: `Cueable mock preview - ${job.input.variant.label}`,
        storage_path: path,
        status: "completed",
        duration: job.input.brief.duration,
      }),
      signal,
    });
  }

  const versionRows = await supabaseRequest<{ id: string }[]>(`/rest/v1/request_versions?request_id=eq.${job.project_id}&storage_path=eq.${encodeURIComponent(path)}&select=id&limit=1`, { signal });
  if (!versionRows.length) {
    const latestVersions = await supabaseRequest<{ version_number: number }[]>(`/rest/v1/request_versions?request_id=eq.${job.project_id}&select=version_number&order=version_number.desc&limit=1`, { signal });
    const versionNumber = (latestVersions[0]?.version_number ?? 0) + 1;
    await supabaseRequest("/rest/v1/request_versions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        request_id: job.project_id,
        version_number: versionNumber,
        title: `Cueable mock preview - ${job.input.variant.label}`,
        storage_path: path,
        uploaded_by: job.user_id,
        is_delivered: true,
        delivered_at: new Date().toISOString(),
      }),
      signal,
    });
  }

  await patchTable("projects", `id=eq.${job.project_id}`, {
    status: "completed",
    workflow_status: "delivered",
    workflow_status_changed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, signal);

  const notifications = await supabaseRequest<{ id: string }[]>(`/rest/v1/user_notifications?project_id=eq.${job.project_id}&kind=eq.ad_ready&select=id&limit=1`, { signal });
  if (!notifications.length) {
    await supabaseRequest("/rest/v1/user_notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: job.user_id,
        project_id: job.project_id,
        kind: "ad_ready",
        title: "Your ad is ready",
        body: "Your Cueable mock preview is ready in the Library.",
      }),
      signal,
    });
  }

  const scenes = await supabaseRequest<{ id: string }[]>(`/rest/v1/generation_scenes?job_id=eq.${job.id}&select=id`, { signal });
  for (const scene of scenes) {
    await patchTable("generation_scenes", `id=eq.${scene.id}`, { status: "done", progress: 100, updated_at: new Date().toISOString() }, signal);
  }
  await patchTable("generation_jobs", `id=eq.${job.id}`, {
    status: "done",
    progress: 100,
    cost: result.cost,
    model: result.model,
    error: null,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, signal);
}

async function runAttempt(job: Job) {
  const signal = AbortSignal.timeout(60_000);
  const sceneRows = await supabaseRequest<{ scene_number: number; visual_description: string }[]>(`/rest/v1/generation_scenes?job_id=eq.${job.id}&select=scene_number,visual_description&order=scene_number.asc`, { signal });
  if (!sceneRows.length) throw new Error("The generation job has no scenes.");
  const result = await mockProvider.generate(job.input, async (sceneNumber, progress) => {
    await updateProgress(job.id, sceneNumber, progress, sceneRows.length, signal);
  }, signal);
  await finishJob(job, result, signal);
}

async function runWithRetries(jobId: string) {
  while (true) {
    const claimed = await supabaseRequest<Job[]>("/rest/v1/rpc/claim_generation_job", {
      method: "POST",
      body: JSON.stringify({ p_job_id: jobId }),
    });
    const job = claimed[0];
    if (!job) return;

    try {
      await runAttempt(job);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Video generation failed.";
      if (job.attempt_count < job.max_attempts) {
        await patchTable("generation_jobs", `id=eq.${job.id}`, {
          status: "queued",
          progress: 0,
          error: message,
          updated_at: new Date().toISOString(),
        });
        await new Promise((resolve) => setTimeout(resolve, 250 * job.attempt_count));
        continue;
      }

      await patchTable("generation_scenes", `job_id=eq.${job.id}`, {
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      });
      await patchTable("generation_jobs", `id=eq.${job.id}`, {
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await supabaseRequest("/rest/v1/rpc/refund_generation_job_credits", {
        method: "POST",
        body: JSON.stringify({ p_job_id: job.id }),
      });
      await patchTable("projects", `id=eq.${job.project_id}`, {
        status: "failed",
        updated_at: new Date().toISOString(),
      });
      return;
    }
  }
}

runtime.Deno?.serve(async (request) => {
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey || request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: "Unauthorized worker request." }, { status: 401 });
  }
  let body: { jobId?: unknown };
  try {
    body = await request.json() as { jobId?: unknown };
  } catch {
    return Response.json({ error: "Invalid generation job." }, { status: 400 });
  }
  if (typeof body.jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.jobId)) {
    return Response.json({ error: "Invalid generation job." }, { status: 400 });
  }
  if (!runtime.EdgeRuntime?.waitUntil) {
    return Response.json({ error: "Background generation is unavailable in this runtime." }, { status: 503 });
  }

  runtime.EdgeRuntime.waitUntil(runWithRetries(body.jobId));
  return Response.json({ accepted: true }, { status: 202 });
});