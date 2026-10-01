import { z } from "zod";

export const productScrapeDataSchema = z.object({
  sourceUrl: z.string().url().max(2048).refine((value) => value.startsWith("http://") || value.startsWith("https://")),
  title: z.string().max(240),
  description: z.string().max(1200),
  price: z.string().max(120),
  keyFeatures: z.array(z.string().max(240)).max(8),
  images: z.array(z.object({
    assetId: z.string().uuid(),
    name: z.string().max(255),
    url: z.string().url().max(2048),
  }).strict()).max(3),
}).strict();

export type ProductScrapeData = z.infer<typeof productScrapeDataSchema>;