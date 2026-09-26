"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { generationStages } from "@/data/projects";
import { requestGeneration } from "@/services/generation";

const modes = [
  { id: "prompt", label: "Prompt" },
  { id: "url", label: "URL" },
  { id: "assets", label: "Assets" },
] as const;

export function CreateStudio() {
  const router = useRouter();
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("prompt");
  const [prompt, setPrompt] = useState("Create a 20-second ad for a matte black ceramic pour-over. Morning light. No voiceover.");
  const [url, setUrl] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("20s");
  const [stage, setStage] = useState(-1);
  const [running, setRunning] = useState(false);

  async function onGenerate() {
    if (running) return;
    setRunning(true);
    await requestGeneration({ mode, prompt, url, ratio, duration });
    for (let index = 0; index < generationStages.length; index += 1) {
      setStage(index);
      await new Promise((resolve) => setTimeout(resolve, 420));
    }
    router.push("/app/projects/titanium-watch");
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <h1 className="font-serif text-[32px] leading-[1.15] text-ink-2">What do you want to cut?</h1>
      <p className="mt-2 text-[14px] text-muted">This walks a local preview. It does not render a video yet.</p>
      <div className="mt-6 flex gap-1 rounded-[var(--radius-pill)] bg-sidebar p-1">
        {modes.map((item) => (
          <button key={item.id} type="button" onClick={() => setMode(item.id)} className={`flex-1 cursor-pointer rounded-[var(--radius-pill)] py-2 text-[13.5px] font-medium ${mode === item.id ? "bg-surface text-ink" : "text-muted"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {mode === "prompt" ? (
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-4 h-36 w-full resize-none rounded-[16px] border border-line px-4 py-3 text-[15px] leading-[1.45] outline-none" />
      ) : null}
      {mode === "url" ? (
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a product URL" className="mt-4 h-12 w-full rounded-[14px] border border-line px-4 text-[14px] outline-none" />
      ) : null}
      {mode === "assets" ? (
        <div className="mt-4 flex h-28 items-center justify-center rounded-[16px] border border-dashed border-line text-[14px] text-muted">
          Drop a logo, stills, or a reference clip
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select label="Aspect ratio" value={ratio} onChange={setRatio} options={["9:16", "1:1", "16:9"]} />
        <Select label="Duration" value={duration} onChange={setDuration} options={["10s", "15s", "20s", "30s"]} />
      </div>
      <button type="button" disabled={running} onClick={onGenerate} className="mt-6 h-11 cursor-pointer rounded-[var(--radius-pill)] bg-ink px-5 text-[14px] font-medium text-surface disabled:opacity-60">
        Generate video
      </button>
      {stage >= 0 ? (
        <ol className="mt-8 space-y-2">
          {generationStages.map((label, index) => (
            <li key={label} className={`text-[14px] ${index <= stage ? "text-ink" : "text-muted-2"}`}>
              {index < stage ? "Done" : index === stage ? "Now" : "Next"} · {label}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="text-[13px] font-medium text-ink-2">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px]">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
