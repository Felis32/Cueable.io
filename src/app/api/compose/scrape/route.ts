import { z } from "zod";
import { scrapeProductPage } from "@/lib/ai/product-scrape";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const scrapeRequestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in to read a product page." }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid product page request." }, { status: 400 });
  }
  const parsed = scrapeRequestSchema.safeParse(rawBody);
  if (!parsed.success) return Response.json({ error: "Provide a valid product page URL." }, { status: 400 });

  try {
    const product = await scrapeProductPage(parsed.data.url, user.id, request.signal);
    return Response.json({ product }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({
      product: null,
      warning: "Cueable couldn’t read that product page. You can continue with your prompt and add product details yourself.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
}