import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { signCovers } from "@/lib/supabase/custom-lists";
import { MAX_UPLOAD_BYTES, reviewUpload, uploadPath } from "@/lib/custom-lists/uploads";

/**
 * The one door pictures come in through.
 *
 * This is the first route in the app that writes on a person's behalf, and it
 * exists because the rules it enforces cannot live in the browser: the size,
 * the format and the quotas are all things an uploader would otherwise be
 * asked politely to respect. It acts as the signed-in user — no service key,
 * ever — so row-level security still has the final say on the list being
 * written to; what this adds is judgement about the bytes.
 */

const BUCKET = "custom-uploads";

/** A day, for the rolling upload quota. Rolling rather than calendar: midnight in whose timezone? */
const DAY_MS = 24 * 60 * 60 * 1000;

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return fail(503, "Cloud accounts are not configured.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sign in to upload a picture.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "That upload could not be read.");
  }

  const file = form.get("file");
  const listId = String(form.get("listId") ?? "");
  const caption = String(form.get("caption") ?? "").slice(0, 120);
  const rowId = form.get("rowId") ? String(form.get("rowId")) : null;
  // Present only when the picture is meant to become a tier's label rather
  // than a card on the board.
  const tierRowId = form.get("tierRowId") ? String(form.get("tierRowId")) : null;
  const rightsConfirmed = form.get("rightsConfirmed") === "true";

  if (!(file instanceof File)) return fail(400, "No image was attached.");
  if (!listId) return fail(400, "No board was named.");

  // Refuse an oversized file before pulling it into memory.
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(413, `Images must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
  }

  const { data: list } = await supabase
    .from("custom_tier_lists")
    .select("id, user_id")
    .eq("id", listId)
    .maybeSingle();
  if (!list) return fail(404, "That board does not exist.");
  if (list.user_id !== user.id) return fail(403, "That board belongs to someone else.");

  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [{ count: itemsInList }, { count: uploadsToday }] = await Promise.all([
    supabase
      .from("custom_items")
      .select("id", { count: "exact", head: true })
      .eq("list_id", listId),
    supabase
      .from("custom_uploads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since),
  ]);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = reviewUpload({
    bytes,
    rightsConfirmed,
    // A tier's own picture is not a card, so it does not count against the
    // board's card limit — but it does count against the daily one.
    itemsInList: tierRowId ? 0 : (itemsInList ?? 0),
    uploadsToday: uploadsToday ?? 0,
  });
  if (!verdict.ok) return fail(verdict.status, verdict.message);

  const id = crypto.randomUUID();
  const path = uploadPath(user.id, listId, id, verdict.extension);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: verdict.contentType,
    upsert: false,
  });
  if (uploadError) return fail(502, "The image could not be stored. Try again.");

  // The ledger is written before the card: a file with no record is invisible
  // to the daily quota and to a takedown, which are the two things that must
  // never be able to lose track of it.
  await supabase.from("custom_uploads").insert({
    user_id: user.id,
    image_path: path,
    byte_size: bytes.byteLength,
    content_type: verdict.contentType,
  });

  if (tierRowId) {
    const { error } = await supabase
      .from("custom_tier_rows")
      .update({ image_path: path })
      .eq("id", tierRowId)
      .eq("list_id", listId);
    if (error) return fail(500, "The tier could not be updated.");
  } else {
    const { error } = await supabase.from("custom_items").insert({
      list_id: listId,
      row_id: rowId,
      position: itemsInList ?? 0,
      caption,
      image_path: path,
    });
    if (error) return fail(500, "The card could not be added.");
  }

  await supabase
    .from("custom_tier_lists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", listId);

  const signed = await signCovers(supabase, [path]);
  return NextResponse.json({ imagePath: path, imageUrl: signed.get(path) ?? null }, { status: 201 });
}
