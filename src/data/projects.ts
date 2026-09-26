export type Project = {
  id: string;
  name: string;
  status: "Draft" | "Ready" | "Rendering";
  created: string;
  duration: string;
  ratio: string;
  resolution: string;
  tint: "rose" | "sage" | "peach" | "sky";
  brief: string;
  scenes: { title: string; detail: string }[];
};

export const projects: Project[] = [
  {
    id: "titanium-watch",
    name: "Titanium watch — 20s",
    status: "Ready",
    created: "Sep 18, 2026",
    duration: "0:20",
    ratio: "9:16",
    resolution: "1080×1920",
    tint: "peach",
    brief: "A quiet product ad. Close on the case, then the strap, then a single line of type.",
    scenes: [
      { title: "Hook", detail: "Black frame. One specular highlight on the bezel." },
      { title: "Product", detail: "Slow push-in on the titanium case." },
      { title: "Feature", detail: "Strap texture, then the crown." },
      { title: "Benefit", detail: "On-wrist, daylight, no lifestyle clutter." },
      { title: "CTA", detail: "Name, price line, shop link." },
    ],
  },
  {
    id: "ceramic-cup",
    name: "Ceramic cup launch",
    status: "Draft",
    created: "Sep 12, 2026",
    duration: "0:15",
    ratio: "1:1",
    resolution: "1080×1080",
    tint: "sage",
    brief: "Pour, steam, logo. No voiceover.",
    scenes: [
      { title: "Hook", detail: "Empty table, cup enters." },
      { title: "Product", detail: "Pour in one take." },
      { title: "CTA", detail: "Wordmark, then hold." },
    ],
  },
  {
    id: "ledger-app",
    name: "Ledger app — story",
    status: "Rendering",
    created: "Sep 9, 2026",
    duration: "0:12",
    ratio: "9:16",
    resolution: "1080×1920",
    tint: "sky",
    brief: "Three screens, one outcome: the invoice is sent.",
    scenes: [
      { title: "Hook", detail: "Notification card." },
      { title: "Product", detail: "Create, send, paid." },
      { title: "CTA", detail: "Start free." },
    ],
  },
];

export const generationStages = [
  "Reading the brief",
  "Choosing the structure",
  "Writing the scenes",
  "Setting type and pace",
  "Assembling the cut",
  "Preview ready",
];
