import "server-only";

import { z } from "zod";

const searchResponseSchema = z.object({
  answer: z.string().nullable().optional(),
  results: z.array(z.object({
    title: z.string().max(300),
    url: z.string().url().max(2048).refine((value) => /^https?:\/\//i.test(value)),
    content: z.string().max(8_000),
    published_date: z.string().nullable().optional(),
  }).passthrough()).max(10),
}).passthrough();

export type WebSearchSource = {
  title: string;
  url: string;
  excerpt: string;
  publishedDate?: string;
};

export type WebSearchResult = {
  answer?: string;
  sources: WebSearchSource[];
};

export class WebSearchConfigurationError extends Error {
  constructor() {
    super("Web search is not configured. Add TAVILY_API_KEY on the server to look up current information.");
    this.name = "WebSearchConfigurationError";
  }
}

export class WebSearchError extends Error {
  constructor() {
    super("Cueable couldn't reach web search just now. Please try again.");
    this.name = "WebSearchError";
  }
}

export async function searchPublicWeb(query: string): Promise<WebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new WebSearchConfigurationError();

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: query.normalize("NFKC").trim().slice(0, 500),
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new WebSearchError();
    const parsed = searchResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new WebSearchError();
    return {
      answer: parsed.data.answer ?? undefined,
      sources: parsed.data.results.map((source) => ({
        title: source.title,
        url: source.url,
        excerpt: source.content,
        publishedDate: source.published_date ?? undefined,
      })),
    };
  } catch (error) {
    if (error instanceof WebSearchError) throw error;
    throw new WebSearchError();
  }
}

export function shouldSearchPublicWeb(query: string) {
  return /\b(search|browse|look\s*up|find(?:\s+me)?|latest|current|today|right now|live|recent|news|weather|flight|airfare|fare|ticket|price|cost|stock|exchange rate|opening hours|availability|schedule|score|results)\b/i.test(query);
}