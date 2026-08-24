import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomBoard,
  CustomItem,
  CustomTierList,
  CustomTierRow,
} from "@/lib/types/custom-list";
import { STARTER_ROWS } from "@/lib/types/custom-list";
import { describeWriteFailure } from "@/lib/supabase/write-failure";
import { validatePost } from "@/lib/feed/post-preview";

/**
 * Reading and writing custom boards.
 *
 * Takes a client rather than making one, so the same code serves the server
 * component that renders a board and the browser that then edits it. Every call
 * relies on row-level security for authorisation — nothing here decides who may
 * see or change anything, it only asks.
 */

/** How long a cover url stays valid. Long enough to browse, short enough that a takedown bites. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

const BUCKET = "custom-uploads";

interface ListRow {
  id: string;
  user_id: string;
  title: string;
  is_public: boolean;
  hidden_at: string | null;
  updated_at: string;
}

interface TierRowRow {
  id: string;
  list_id: string;
  position: number;
  label: string;
  color: string;
  image_path: string | null;
}

interface ItemRow {
  id: string;
  list_id: string;
  row_id: string | null;
  position: number;
  caption: string;
  image_path: string;
  hidden_at: string | null;
}

function toList(row: ListRow): CustomTierList {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    isPublic: row.is_public,
    hiddenAt: row.hidden_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Signs a batch of paths in one call.
 *
 * One request rather than one per picture: a board of a hundred cards would
 * otherwise open a hundred connections before it could draw anything.
 */
export async function signCovers(
  supabase: SupabaseClient,
  paths: string[]
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return signed;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return signed;

  for (const entry of data) {
    // A path the reader is not allowed to see comes back with an error rather
    // than a url, which is the storage policy doing its job — the card renders
    // without its picture instead of the request failing.
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

export async function getCustomBoard(
  supabase: SupabaseClient,
  listId: string,
  viewerId: string | null
): Promise<CustomBoard | null> {
  const { data: listData, error } = await supabase
    .from("custom_tier_lists")
    .select("id, user_id, title, is_public, hidden_at, updated_at")
    .eq("id", listId)
    .maybeSingle();
  if (error || !listData) return null;

  const list = toList(listData as ListRow);

  const [rowsResult, itemsResult] = await Promise.all([
    supabase
      .from("custom_tier_rows")
      .select("id, list_id, position, label, color, image_path")
      .eq("list_id", listId)
      .order("position", { ascending: true }),
    supabase
      .from("custom_items")
      .select("id, list_id, row_id, position, caption, image_path, hidden_at")
      .eq("list_id", listId)
      .order("position", { ascending: true }),
  ]);

  const rowRows = (rowsResult.data ?? []) as TierRowRow[];
  const itemRows = (itemsResult.data ?? []) as ItemRow[];

  const covers = await signCovers(supabase, [
    ...rowRows.map((r) => r.image_path).filter((p): p is string => Boolean(p)),
    ...itemRows.map((i) => i.image_path),
  ]);

  const rows: CustomTierRow[] = rowRows.map((r) => ({
    id: r.id,
    listId: r.list_id,
    position: r.position,
    label: r.label,
    color: r.color,
    imagePath: r.image_path,
    imageUrl: r.image_path ? (covers.get(r.image_path) ?? null) : null,
  }));

  const items: CustomItem[] = itemRows.map((i) => ({
    id: i.id,
    listId: i.list_id,
    rowId: i.row_id,
    position: i.position,
    caption: i.caption,
    imagePath: i.image_path,
    imageUrl: covers.get(i.image_path) ?? null,
    hiddenAt: i.hidden_at,
  }));

  return { list, rows, items, canEdit: viewerId === list.userId };
}

export async function listMyCustomBoards(
  supabase: SupabaseClient,
  userId: string
): Promise<CustomTierList[]> {
  const { data } = await supabase
    .from("custom_tier_lists")
    .select("id, user_id, title, is_public, hidden_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return ((data ?? []) as ListRow[]).map(toList);
}

/**
 * A new board, with its starter tiers.
 *
 * The tiers are created here rather than by a database trigger so that a board
 * is never briefly a board with no tiers — the page has somewhere to put a card
 * from the first render.
 */
export type CreateBoardOutcome = { id: string } | { error: string };

export async function createCustomBoard(
  supabase: SupabaseClient,
  userId: string,
  title: string
): Promise<CreateBoardOutcome> {
  const { data, error } = await supabase
    .from("custom_tier_lists")
    .insert({ user_id: userId, title })
    .select("id")
    .single();
  if (error || !data) {
    // Logged as well as returned: the sentence shown to the reader is
    // deliberately shorter than the one worth having in a bug report.
    console.error("TierListOnline: creating a board failed —", error);
    return { error: describeWriteFailure(error) };
  }

  const listId = data.id as string;
  const { error: rowsError } = await supabase.from("custom_tier_rows").insert(
    STARTER_ROWS.map((row, index) => ({
      list_id: listId,
      position: index,
      label: row.label,
      color: row.color,
    }))
  );
  if (rowsError) {
    // The board exists but has no tiers to drop anything into, which is worse
    // than no board at all: it looks finished and is not.
    console.error("TierListOnline: a board was created without its tiers —", rowsError);
    return { error: describeWriteFailure(rowsError) };
  }

  return { id: listId };
}

export async function renameCustomBoard(
  supabase: SupabaseClient,
  listId: string,
  title: string
): Promise<void> {
  await supabase
    .from("custom_tier_lists")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", listId);
}

export async function setBoardVisibility(
  supabase: SupabaseClient,
  listId: string,
  isPublic: boolean
): Promise<void> {
  await supabase
    .from("custom_tier_lists")
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq("id", listId);
}

export async function deleteCustomBoard(supabase: SupabaseClient, listId: string): Promise<void> {
  await supabase.from("custom_tier_lists").delete().eq("id", listId);
}

export async function updateTierRow(
  supabase: SupabaseClient,
  rowId: string,
  patch: { label?: string; color?: string; imagePath?: string | null }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.imagePath !== undefined) update.image_path = patch.imagePath;
  if (Object.keys(update).length === 0) return;
  await supabase.from("custom_tier_rows").update(update).eq("id", rowId);
}

export async function addTierRow(
  supabase: SupabaseClient,
  listId: string,
  position: number
): Promise<void> {
  await supabase
    .from("custom_tier_rows")
    .insert({ list_id: listId, position, label: "New tier", color: "#8b5cf6" });
}

/**
 * Takes the picture off a tier, leaving the tier itself alone.
 *
 * The file is not removed from the bucket, and does not need to be: nothing is
 * served out of there without a row pointing at it, so an unreferenced object
 * is already unreachable. Clearing the reference is the whole of the removal,
 * and it cannot fail halfway.
 */
export async function clearTierRowImage(supabase: SupabaseClient, rowId: string): Promise<void> {
  await supabase.from("custom_tier_rows").update({ image_path: null }).eq("id", rowId);
}

export async function deleteTierRow(supabase: SupabaseClient, rowId: string): Promise<void> {
  // The cards are not deleted with it: the foreign key sets them adrift into
  // the pool, which is recoverable, and losing a picture is not.
  await supabase.from("custom_tier_rows").delete().eq("id", rowId);
}

/** Where a card sits now — the one write a drag produces. */
export async function moveItem(
  supabase: SupabaseClient,
  itemId: string,
  rowId: string | null,
  position: number
): Promise<void> {
  await supabase.from("custom_items").update({ row_id: rowId, position }).eq("id", itemId);
}

export async function setItemCaption(
  supabase: SupabaseClient,
  itemId: string,
  caption: string
): Promise<void> {
  await supabase.from("custom_items").update({ caption }).eq("id", itemId);
}

/** Hidden, not deleted: the owner can put it back, and the record survives a report. */
export async function setItemHidden(
  supabase: SupabaseClient,
  itemId: string,
  hidden: boolean
): Promise<void> {
  await supabase
    .from("custom_items")
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq("id", itemId);
}

export async function deleteItem(supabase: SupabaseClient, itemId: string): Promise<void> {
  await supabase.from("custom_items").delete().eq("id", itemId);
}

/* ------------------------------------------------------------ publishing -- */

/** A tier as it stood when Publish was pressed. */
export interface SnapshotRow {
  id: string;
  label: string;
  color: string;
  position: number;
}

/** A card as it stood then — no picture, deliberately. See below. */
export interface SnapshotItem {
  id: string;
  rowId: string | null;
  position: number;
  caption: string;
}

export interface BoardSnapshot {
  rows: SnapshotRow[];
  items: SnapshotItem[];
}

/**
 * The shape of a board, and only the shape.
 *
 * No image paths and no copies of anything: a published post looks its cards up
 * live every time it renders, so a card that is later hidden, blocked or
 * deleted has nothing here to be rendered from. That is what keeps a takedown
 * working after publication — the frozen half cannot outlive the moderated
 * half if the frozen half never held a picture.
 */
export function buildSnapshot(rows: CustomTierRow[], items: CustomItem[]): BoardSnapshot {
  return {
    rows: rows
      .map((r) => ({ id: r.id, label: r.label, color: r.color, position: r.position }))
      .sort((a, b) => a.position - b.position),
    items: items
      .map((i) => ({ id: i.id, rowId: i.rowId, position: i.position, caption: i.caption }))
      .sort((a, b) => a.position - b.position),
  };
}

export type PublishOutcome = { postId: string } | { error: string };

export async function publishCustomBoard(
  supabase: SupabaseClient,
  board: CustomBoard,
  title: string,
  description: string
): Promise<PublishOutcome> {
  /*
   * The post's title is asked for rather than taken from the board.
   *
   * It used to be the board's name, which reads as the same thing and is not:
   * a board may be called anything from one character up, a post title must be
   * at least three, and the two rules were written in different migrations
   * without either knowing about the other. A board called "ez" therefore
   * published fine right up to the database, which refused it in its own words
   * — `violates check constraint "posts_title_check"` — with nothing to do
   * about it, since the name that offended was not on the screen anywhere.
   *
   * Checked here against the same rules the feed's own dialog uses, so the
   * answer arrives before the write and says something a person can act on.
   */
  const postTitle = title.trim();
  const validation = validatePost(postTitle, description);
  if (!validation.ok) return { error: validation.error };

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: board.list.userId,
      title: postTitle,
      description: description.trim(),
      category: "custom",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("TierListOnline: publishing a board failed —", error);
    return { error: describeWriteFailure(error) };
  }

  const postId = data.id as string;
  const { error: snapshotError } = await supabase.from("custom_list_publications").insert({
    post_id: postId,
    list_id: board.list.id,
    snapshot: buildSnapshot(board.rows, board.items),
  });
  if (snapshotError) {
    // A post with no snapshot would render as an empty board for everyone, so
    // it is taken back rather than left in the feed as a puzzle.
    await supabase.from("posts").delete().eq("id", postId);
    console.error("TierListOnline: the snapshot failed, so the post was withdrawn —", snapshotError);
    return { error: describeWriteFailure(snapshotError) };
  }

  return { postId };
}

/** A published board, ready to render: frozen shape, covers resolved just now. */
export interface PublishedBoard {
  postId: string;
  listId: string;
  rows: SnapshotRow[];
  items: (SnapshotItem & { imageUrl: string | null })[];
}

/**
 * Resolves published boards for a batch of posts.
 *
 * The shape comes from the snapshot; the pictures come from the cards as they
 * are right now, through the same row-level security every other read goes
 * through. A card that has since been hidden, blocked or deleted simply is not
 * in the lookup, so it drops out of the post — the structure still says where
 * it sat, and nothing renders there.
 */
export async function getPublishedBoards(
  supabase: SupabaseClient,
  postIds: string[]
): Promise<Map<string, PublishedBoard>> {
  const boards = new Map<string, PublishedBoard>();
  if (postIds.length === 0) return boards;

  const { data, error } = await supabase
    .from("custom_list_publications")
    .select("post_id, list_id, snapshot")
    .in("post_id", postIds);
  if (error || !data) return boards;

  const publications = data as { post_id: string; list_id: string; snapshot: BoardSnapshot }[];
  const itemIds = publications.flatMap((p) => (p.snapshot.items ?? []).map((i) => i.id));
  if (itemIds.length === 0) return boards;

  const { data: liveItems } = await supabase
    .from("custom_items")
    .select("id, image_path")
    .in("id", itemIds);

  const paths = new Map<string, string>();
  for (const item of (liveItems ?? []) as { id: string; image_path: string }[]) {
    paths.set(item.id, item.image_path);
  }
  const covers = await signCovers(supabase, [...paths.values()]);

  for (const publication of publications) {
    boards.set(publication.post_id, {
      postId: publication.post_id,
      listId: publication.list_id,
      rows: publication.snapshot.rows ?? [],
      items: (publication.snapshot.items ?? []).map((item) => {
        const path = paths.get(item.id);
        return { ...item, imageUrl: path ? (covers.get(path) ?? null) : null };
      }),
    });
  }

  return boards;
}
