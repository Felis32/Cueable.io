import Link from "next/link";
import { notFound } from "next/navigation";
import { Thumb } from "@/components/marketing/Thumb";
import { projects } from "@/data/projects";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find((item) => item.id === id);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-[860px]">
      <p className="text-[13px] text-muted">Preview layout. No file has been rendered.</p>
      <h1 className="mt-2 font-serif text-[32px] leading-[1.15] text-ink-2">{project.name}</h1>
      <div className="mt-6">
        <Thumb tint={project.tint} label={project.duration} ratio="16/9" />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
        {[
          ["Duration", project.duration],
          ["Ratio", project.ratio],
          ["Resolution", project.resolution],
          ["Created", project.created],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium text-ink-2">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        {["Download", "Regenerate", "Variation", "Edit", "Share"].map((action) => (
          <span key={action} className="rounded-[var(--radius-pill)] border border-line px-3 py-1.5 text-[13px] text-muted">
            {action}
          </span>
        ))}
      </div>
      <h2 className="mt-10 text-[16px] font-medium text-ink-2">Scenes</h2>
      <ol className="mt-3 divide-y divide-line border-y border-line">
        {project.scenes.map((scene, index) => (
          <li key={scene.title} className="grid gap-1 py-3 sm:grid-cols-[120px_1fr]">
            <span className="text-[14px] font-medium text-ink-2">{index + 1}. {scene.title}</span>
            <span className="text-[14px] text-muted">{scene.detail}</span>
          </li>
        ))}
      </ol>
      <Link href="/app/create" className="mt-8 inline-flex text-[14px] font-medium text-ink">
        New brief
      </Link>
    </div>
  );
}
