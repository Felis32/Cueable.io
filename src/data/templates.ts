export type Template = {
  id: string;
  title: string;
  category: string;
  duration: string;
  ratio: string;
  tint: "rose" | "sage" | "peach" | "sky";
};

export const templateCategories = [
  "All",
  "Product",
  "UGC",
  "App",
  "Commerce",
  "SaaS",
  "Social",
  "Cinematic",
  "Minimal",
] as const;

export const templates: Template[] = [
  { id: "linen-pour", title: "Linen pour", category: "Product", duration: "0:15", ratio: "9:16", tint: "peach" },
  { id: "desk-object", title: "Desk object", category: "Minimal", duration: "0:20", ratio: "1:1", tint: "sage" },
  { id: "app-open", title: "First open", category: "App", duration: "0:12", ratio: "9:16", tint: "sky" },
  { id: "shelf-pan", title: "Shelf pan", category: "Commerce", duration: "0:20", ratio: "16:9", tint: "rose" },
  { id: "founder-note", title: "Founder note", category: "UGC", duration: "0:25", ratio: "9:16", tint: "peach" },
  { id: "feature-stack", title: "Feature stack", category: "SaaS", duration: "0:30", ratio: "16:9", tint: "sky" },
  { id: "night-still", title: "Night still", category: "Cinematic", duration: "0:15", ratio: "16:9", tint: "rose" },
  { id: "story-cut", title: "Story cut", category: "Social", duration: "0:10", ratio: "9:16", tint: "sage" },
];
