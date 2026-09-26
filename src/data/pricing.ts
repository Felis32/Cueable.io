export type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  cta: string;
  featured?: boolean;
  features: string[];
};

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "to try a cut",
    description: "One project, watermarked export, enough to see if the cut is right.",
    cta: "Start free",
    features: ["1 active project", "720p preview", "Primecut watermark", "Prompt, URL, or assets"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$39",
    period: "per month",
    description: "For marketers who need a finished ad without a production schedule.",
    cta: "Get started",
    featured: true,
    features: ["Unlimited projects", "1080p export", "No watermark", "3 variations per brief", "All aspect ratios"],
  },
  {
    id: "business",
    name: "Business",
    price: "$99",
    period: "per month",
    description: "Shared brand kits and review for teams shipping ads together.",
    cta: "Talk to us",
    features: ["Everything in Pro", "5 seats", "Brand kit", "Review links", "Priority render queue"],
  },
];
