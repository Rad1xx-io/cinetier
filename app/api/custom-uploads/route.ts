import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { signCovers } from "@/lib/supabase/custom-lists";
import { MAX_UPLOAD_BYTES, reviewUpload } from "@/lib/custom-lists/uploads";

/**
 * The door pictures come in through.
 *
 * It is not the only lock, and it deliberately is not trusted to be. This route
 * acts as the signed-in user — no service key — which means it holds exactly
 * the privileges the browser holds, and anything it merely *decides* could be
 * decided differently by not calling it. So the rules that must hold live in
 * the database: `issue_upload_grant` decides whether a path may be written at
 * all, and `attach_upload` decides whether an uploaded file may become a card,
 * measuring it from Storage rather than believing the uploader.
 *
 * What this route adds on top is the one check SQL cannot make: reading the
 * leading bytes to see whether a file is the format it claims to be.
 */

const BUCKET = "custom-uploads";
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
  const tierRowId = form.get("tierRowId") ? String(form.get("tierRowId")) : null;
  const rightsConfirmed = form.get("rightsConfirmed") === "true";

  if (!(file instanceof File)) return fail(400, "No image was attached.");
  if (!listId) return fail(400, "No board was named.");

  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(413, `Images must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
  }

  // Counted here only so the answer is a sentence rather than a database
  // exception. The same limits are enforced again inside issue_upload_grant,
  // which is the copy that matters.
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [{ count: itemsInList }, { count: uploadsToday }] = await Promise.all([
    supabase.from("custom_items").select("id", { count: "exact", head: true }).eq("list_id", listId),
    supabase
      .from("upload_grants")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since),
  ]);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = reviewUpload({
    bytes,
    rightsConfirmed,
    itemsInList: tierRowId ? 0 : (itemsInList ?? 0),
    uploadsToday: uploadsToday ?? 0,
  });
  if (!verdict.ok) return fail(verdict.status, verdict.message);

  // Nothing can be written to the bucket until this returns a path, and it
  // returns one only for a board this account owns, within its limits, with the
  // rights question answered.
  const { data: path, error: grantError } = await supabase.rpc("issue_upload_grant", {
    p_list_id: listId,
    p_rights_confirmed: rightsConfirmed,
    p_extension: verdict.extension,
    p_for_tier: tierRowId !== null,
  });
  if (grantError || typeof path !== "string") {
    return fail(403, grantError?.message ?? "That upload was not allowed.");
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: verdict.contentType,
    upsert: false,
  });
  if (uploadError) {
    /*
     * The bucket filling up is not a transient failure, and telling somebody to
     * try again would send them round a loop that cannot succeed. It is worth
     * separating even though it should be rare, because the day it happens
     * every upload on the site fails at once.
     */
    const message = uploadError.message ?? "";
    if (/quota|exceeded|maximum.*size|storage.*full|payload too large/i.test(message)) {
      console.error("TierListOnline: storage refused an upload —", message);
      return fail(507, "Picture storage is full. This is ours to fix — please try again later.");
    }
    return fail(502, "The image could not be stored. Try again.");
  }

  const { error: attachError } = await supabase.rpc("attach_upload", {
    p_path: path,
    p_caption: caption,
    p_row_id: rowId,
    p_tier_row_id: tierRowId,
  });
  if (attachError) {
    // The file exists but is referenced by nothing, so it is served to nobody.
    // Removing it keeps the bucket honest rather than leaving a stray.
    await supabase.storage.from(BUCKET).remove([path]);
    return fail(400, attachError.message);
  }

  const signed = await signCovers(supabase, [path]);
  return NextResponse.json({ imagePath: path, imageUrl: signed.get(path) ?? null }, { status: 201 });
}
