import { requireAdminContext } from "@/lib/admin-requests";
import { isHomeCardHoverAnimation } from "@/data/home-content";

const sections = ["features", "examples", "client_work"] as const;
const mediaTypes = ["text", "image", "audio", "video"] as const;

export async function POST(request: Request) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid content item." }, { status: 400 });
  }

  const section = body.section;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const mediaType = body.media_type;
  if (!sections.includes(section as (typeof sections)[number])) {
    return Response.json({ error: "Choose a valid content section." }, { status: 400 });
  }
  if (!title || title.length > 200) {
    return Response.json({ error: "A title is required (up to 200 characters)." }, { status: 400 });
  }
  if (!mediaTypes.includes(mediaType as (typeof mediaTypes)[number])) {
    return Response.json({ error: "Choose a valid media type." }, { status: 400 });
  }
  if (!isHomeCardHoverAnimation(body.hover_animation)) {
    return Response.json({ error: "Choose a valid card hover animation." }, { status: 400 });
  }

  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  const item = {
    id,
    section,
    title,
    body: typeof body.body === "string" ? body.body : "",
    meta: typeof body.meta === "string" ? body.meta : null,
    media_type: mediaType,
    media_url: typeof body.media_url === "string" ? body.media_url : "",
    text_content: typeof body.text_content === "string" ? body.text_content : "",
    hover_animation: body.hover_animation,
    tint: typeof body.tint === "string" ? body.tint : null,
    kind: typeof body.kind === "string" ? body.kind : null,
    created_at: typeof body.created_at === "string" ? body.created_at : new Date().toISOString(),
  };

  const { data, error } = await context.admin
    .from("home_content")
    .upsert(item, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ item: data });
}

export async function DELETE(request: Request) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  let body: { id?: unknown; section?: unknown };
  try {
    body = await request.json() as { id?: unknown; section?: unknown };
  } catch {
    return Response.json({ error: "Invalid content removal request." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id || !sections.includes(body.section as (typeof sections)[number])) {
    return Response.json({ error: "Choose a valid content item." }, { status: 400 });
  }

  const { error } = await context.admin.from("home_content").delete().eq("id", body.id).eq("section", body.section);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const context = await requireAdminContext();
  if (!context.ok) return context.response;

  let body: { id?: unknown; section?: unknown; hover_animation?: unknown };
  try {
    body = await request.json() as { id?: unknown; section?: unknown; hover_animation?: unknown };
  } catch {
    return Response.json({ error: "Invalid animation update." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id || !sections.includes(body.section as (typeof sections)[number])) {
    return Response.json({ error: "Choose a valid content item." }, { status: 400 });
  }
  if (!isHomeCardHoverAnimation(body.hover_animation)) {
    return Response.json({ error: "Choose a valid card hover animation." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("home_content")
    .update({ hover_animation: body.hover_animation })
    .eq("id", body.id)
    .eq("section", body.section)
    .select("id")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Content item not found." }, { status: 404 });

  return Response.json({ ok: true, hover_animation: body.hover_animation });
}