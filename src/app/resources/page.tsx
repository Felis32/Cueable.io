import { PublicFrame } from "@/components/marketing/PublicFrame";

const notes = [
  { title: "Writing a brief Primecut can cut", detail: "Length, what must be seen, and what must not." },
  { title: "When to start from a URL", detail: "Use the product page if the copy there is already true." },
  { title: "Aspect ratios that match the buy", detail: "9:16 for stories, 1:1 for feeds, 16:9 for YouTube." },
  { title: "What the preview is", detail: "The app shows a structured preview until a render API is connected." },
];

export default function ResourcesPage() {
  return (
    <PublicFrame>
      <h1 className="font-serif text-[40px] leading-[1.12] text-ink-2 md:text-[52px]">Resources</h1>
      <p className="mt-4 max-w-[460px] text-[15px] leading-[1.5] text-muted">
        Short notes on briefing an ad. Not a blog.
      </p>
      <ul className="mt-10 divide-y divide-line border-y border-line">
        {notes.map((note) => (
          <li key={note.title} className="py-5">
            <h2 className="text-[16px] font-medium text-ink-2">{note.title}</h2>
            <p className="mt-1 text-[14px] text-muted">{note.detail}</p>
          </li>
        ))}
      </ul>
    </PublicFrame>
  );
}
