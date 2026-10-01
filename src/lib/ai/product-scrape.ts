import "server-only";

import { lookup } from "node:dns";
import type { TcpSocketConnectOpts } from "node:net";
import * as ipaddr from "ipaddr.js";
import { load } from "cheerio";
import { Agent, fetch as undiciFetch } from "undici";
import { createAdminClient } from "@/lib/supabase/admin";
import { productScrapeDataSchema, type ProductScrapeData } from "@/lib/ai/product-scrape-schema";

const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 4_000_000;
const MAX_IMAGE_COUNT = 3;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 7_000;
const TOTAL_TIMEOUT_MS = 24_000;
const DEFAULT_USER_AGENT = "CueableProductPreview/1.0";

type PageData = Omit<ProductScrapeData, "images"> & { imageCandidates: string[] };
type Lookup = NonNullable<TcpSocketConnectOpts["lookup"]>;

function blockedAddressError() {
  return Object.assign(new Error("The address resolves to a non-public network."), { code: "EAI_ADDRFAMILY" });
}

function isPublicAddress(address: string) {
  return ipaddr.isValid(address) && ipaddr.parse(address).range() === "unicast";
}

const publicLookup: Lookup = (hostname, options, callback) => {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(normalizedHostname)) {
    if (!isPublicAddress(normalizedHostname)) {
      callback(blockedAddressError(), [], 0);
      return;
    }
    const address = ipaddr.parse(normalizedHostname);
    if (options.all) {
      callback(null, [{ address: normalizedHostname, family: address.kind() === "ipv4" ? 4 : 6 }]);
    } else {
      callback(null, normalizedHostname, address.kind() === "ipv4" ? 4 : 6);
    }
    return;
  }

  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(error, [], 0);
      return;
    }
    const compatibleAddresses = addresses.filter(({ address, family }) => isPublicAddress(address) && (!options.family || family === options.family));
    if (!compatibleAddresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      callback(blockedAddressError(), [], 0);
      return;
    }
    if (options.all) {
      callback(null, compatibleAddresses);
    } else {
      callback(null, compatibleAddresses[0].address, compatibleAddresses[0].family);
    }
  });
};

function validatePublicUrl(value: string | URL) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("Only public HTTP or HTTPS product pages are supported.");
  }
  if ((url.port && url.port !== "80" && url.port !== "443") || !hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("That product page address is not publicly accessible.");
  }
  if (ipaddr.isValid(hostname) && !isPublicAddress(hostname)) {
    throw new Error("Private and internal IP addresses cannot be fetched.");
  }
  url.hash = "";
  return url;
}

async function fetchPublicBytes(value: string | URL, maxBytes: number, signal: AbortSignal) {
  let url = validatePublicUrl(value);
  const dispatcher = new Agent({
    connect: { lookup: publicLookup, timeout: REQUEST_TIMEOUT_MS },
    headersTimeout: REQUEST_TIMEOUT_MS,
    bodyTimeout: REQUEST_TIMEOUT_MS,
    maxResponseSize: maxBytes,
  });

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const response = await undiciFetch(url, {
        dispatcher,
        redirect: "manual",
        signal,
        headers: { Accept: "text/html,image/jpeg,image/png,image/webp,image/gif", "User-Agent": DEFAULT_USER_AGENT },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirect === MAX_REDIRECTS) throw new Error("The product page redirected too many times.");
        url = validatePublicUrl(new URL(location, url));
        continue;
      }
      if (!response.ok) throw new Error("The product page could not be read.");
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("The page or image exceeds the download limit.");

      const chunks: Buffer[] = [];
      let total = 0;
      const reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            total += chunk.byteLength;
            if (total > maxBytes) {
              await reader.cancel();
              throw new Error("The page or image exceeds the download limit.");
            }
            chunks.push(Buffer.from(chunk));
          }
        } finally {
          reader.releaseLock();
        }
      }
      return {
        url: url.toString(),
        contentType: response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "",
        bytes: Buffer.concat(chunks, total),
      };
    }
  } finally {
    await dispatcher.destroy().catch(() => undefined);
  }
  throw new Error("The product page could not be read.");
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  const record = asRecord(value);
  if (!record) return "";
  return textValue(record.name ?? record.value ?? record.price ?? record.description ?? record.url ?? record.contentUrl ?? "");
}

function productNodes(value: unknown) {
  const products: Record<string, unknown>[] = [];
  let visited = 0;
  function visit(node: unknown, depth: number) {
    if (depth > 10 || visited++ > 500) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    if (types.some((type) => typeof type === "string" && type.toLowerCase() === "product")) products.push(record);
    for (const child of Object.values(record)) visit(child, depth + 1);
  }
  visit(value, 0);
  return products;
}

function extractPageData(html: string, sourceUrl: string): PageData {
  const $ = load(html);
  const structuredProducts: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, script) => {
    const content = $(script).text();
    if (content.length > 250_000) return;
    try {
      structuredProducts.push(...productNodes(JSON.parse(content)));
    } catch {
    }
  });

  const product = structuredProducts[0] ?? {};
  const meta = (selector: string) => $(selector).first().attr("content") ?? "";
  const title = cleanText(meta("meta[property='og:title']") || product.name || $("title").first().text(), 240);
  const description = cleanText(meta("meta[property='og:description']") || meta("meta[name='description']") || product.description, 1200);
  const offer = Array.isArray(product.offers) ? asRecord(product.offers[0]) : asRecord(product.offers);
  const price = cleanText(meta("meta[property='product:price:amount']") || textValue(offer?.price ?? offer?.lowPrice) || product.price, 120);

  const features = new Set<string>();
  const featureList = product.featureList;
  for (const feature of Array.isArray(featureList) ? featureList : featureList ? [featureList] : []) {
    const text = cleanText(textValue(feature), 240);
    if (text) features.add(text);
  }
  const additionalProperties = Array.isArray(product.additionalProperty) ? product.additionalProperty : product.additionalProperty ? [product.additionalProperty] : [];
  for (const item of additionalProperties) {
    const record = asRecord(item);
    const text = cleanText([textValue(record?.name), textValue(record?.value)].filter(Boolean).join(": "), 240);
    if (text) features.add(text);
  }
  $("main li, [role='main'] li").each((_, item) => {
    if (features.size >= 8) return false;
    const text = cleanText($(item).text(), 240);
    if (text.length >= 12) features.add(text);
    return undefined;
  });

  const imageCandidates: string[] = [];
  const addImage = (value: unknown) => {
    const text = typeof value === "string" ? value : textValue(value);
    if (!text) return;
    try {
      const url = validatePublicUrl(new URL(text, sourceUrl)).toString();
      if (!imageCandidates.includes(url)) imageCandidates.push(url);
    } catch {
    }
  };
  addImage(meta("meta[property='og:image']") || meta("meta[name='twitter:image']"));
  const productImages = Array.isArray(product.image) ? product.image : product.image ? [product.image] : [];
  for (const image of productImages) addImage(image);
  $("img").each((_, image) => {
    if (imageCandidates.length >= 12) return false;
    const node = $(image);
    addImage(node.attr("src") || node.attr("data-src") || node.attr("data-lazy-src"));
    return undefined;
  });

  return {
    sourceUrl: validatePublicUrl(sourceUrl).toString(),
    title,
    description,
    price,
    keyFeatures: [...features].slice(0, 8),
    imageCandidates: imageCandidates.slice(0, 12),
  };
}

function detectImage(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: "png" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return { mime: "image/gif", extension: "gif" };
  return null;
}

export async function scrapeProductPage(url: string, userId: string, signal: AbortSignal) {
  const totalSignal = AbortSignal.any([signal, AbortSignal.timeout(TOTAL_TIMEOUT_MS)]);
  const page = await fetchPublicBytes(url, MAX_HTML_BYTES, totalSignal);
  if (page.contentType !== "text/html" && page.contentType !== "application/xhtml+xml") {
    throw new Error("That URL did not return a product webpage.");
  }
  const parsed = extractPageData(page.bytes.toString("utf8"), page.url);
  const images: ProductScrapeData["images"] = [];
  let admin: ReturnType<typeof createAdminClient> | null = null;
  if (parsed.imageCandidates.length) {
    try {
      admin = createAdminClient();
    } catch {
    }
  }

  for (const imageUrl of parsed.imageCandidates) {
    if (!admin || images.length >= MAX_IMAGE_COUNT || totalSignal.aborted) break;
    try {
      const image = await fetchPublicBytes(imageUrl, MAX_IMAGE_BYTES, totalSignal);
      const detected = detectImage(image.bytes);
      if (!detected) continue;
      const assetName = `${(parsed.title || "product").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 64) || "product"}.${detected.extension}`;
      const path = `${userId}/scraped/${crypto.randomUUID()}.${detected.extension}`;
      const { error: uploadError } = await admin.storage.from("assets").upload(path, image.bytes, {
        contentType: detected.mime,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) continue;
      const publicUrl = admin.storage.from("assets").getPublicUrl(path).data.publicUrl;
      const { data: asset, error: insertError } = await admin.from("assets").insert({
        user_id: userId,
        name: assetName,
        url: publicUrl,
        type: detected.mime,
      }).select("id").single();
      if (insertError || !asset) {
        await admin.storage.from("assets").remove([path]);
        continue;
      }
      images.push({ assetId: asset.id, name: assetName, url: publicUrl });
    } catch {
    }
  }

  return productScrapeDataSchema.parse({
    sourceUrl: parsed.sourceUrl,
    title: parsed.title,
    description: parsed.description,
    price: parsed.price,
    keyFeatures: parsed.keyFeatures,
    images,
  });
}