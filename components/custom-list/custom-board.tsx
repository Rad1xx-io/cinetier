"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Globe, Lock, Plus } from "lucide-react";
import type { CustomBoard as Board, CustomItem } from "@/lib/types/custom-list";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addTierRow,
  deleteItem,
  deleteTierRow,
  moveItem,
  setBoardVisibility,
  setItemHidden,
  updateTierRow,
} from "@/lib/supabase/custom-lists";
import { CustomCard } from "@/components/custom-list/custom-card";
import { CustomTierRow } from "@/components/custom-list/custom-tier-row";
import { UploadDialog } from "@/components/custom-list/upload-dialog";
import { ReportButton } from "@/components/custom-list/report-button";
import { Button } from "@/components/ui/button";
import { tierCollisionDetection } from "@/lib/utils/tier-dnd";

/** The pool of cards not yet given a tier. Its own droppable, like any row. */
const POOL_ID = "pool";

interface CustomBoardProps {
  board: Board;
}

/**
 * A board of the owner's own pictures.
 *
 * Kept apart from the catalogue board on purpose. That one is local-first, and
 * its cards are pointers into TMDB or IGDB that can always be fetched again.
 * These cards own their pictures, need an account, and have to answer to a
 * report — none of which survives a trip through localStorage. What the two
 * share is the drag behaviour, which is imported rather than reimplemented.
 */
export function CustomBoard({ board }: CustomBoardProps) {
  const router = useRouter();
  const [items, setItems] = useState<CustomItem[]>(board.items);
  const [isPublic, setIsPublic] = useState(board.list.isPublic);
  const [rows, setRows] = useState(board.rows);

  /*
   * Adopt the board the server just sent.
   *
   * These three start as copies of the props and then live on their own, so a
   * drag can move a card before the write that records it has finished. The
   * cost is that `useState` reads its argument once and ignores it ever after:
   * uploading a picture called `router.refresh()`, the server re-rendered with
   * the new card in it, the props arrived — and the board went on showing the
   * list it had copied at mount. The picture was in the database, in the
   * bucket, and in the markup, and still nobody could see it without reloading
   * the page by hand.
   *
   * Adjusted during the render that brings the new props rather than in an
   * effect afterwards: React drops this render and starts again immediately,
   * so the board is never painted holding the stale copy.
   */
  const [rendered, setRendered] = useState(board);
  if (rendered !== board) {
    setRendered(board);
    setItems(board.items);
    setRows(board.rows);
    setIsPublic(board.list.isPublic);
  }
  const supabase = getSupabaseBrowserClient();
  const canEdit = board.canEdit && supabase !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { setNodeRef: setPoolRef } = useDroppable({ id: POOL_ID });

  const buckets = useMemo(() => {
    const map = new Map<string, CustomItem[]>();
    map.set(POOL_ID, []);
    for (const row of rows) map.set(row.id, []);
    for (const item of [...items].sort((a, b) => a.position - b.position)) {
      const key = item.rowId && map.has(item.rowId) ? item.rowId : POOL_ID;
      map.get(key)!.push(item);
    }
    return map;
  }, [items, rows]);

  const refresh = useCallback(() => router.refresh(), [router]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!supabase || !canEdit) return;
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      const moved = items.find((i) => i.id === activeId);
      if (!moved) return;

      // Dropping onto a card means "where that card is"; onto a row, the row.
      const overItem = items.find((i) => i.id === overId);
      const targetKey = overItem ? (overItem.rowId ?? POOL_ID) : overId;
      if (!buckets.has(targetKey)) return;

      const targetRowId = targetKey === POOL_ID ? null : targetKey;
      const destination = buckets.get(targetKey)!.filter((i) => i.id !== activeId);
      const index = overItem ? destination.findIndex((i) => i.id === overId) : destination.length;
      const at = index === -1 ? destination.length : index;
      destination.splice(at, 0, { ...moved, rowId: targetRowId });

      // The whole destination is renumbered, so positions stay dense however
      // many times cards have been shuffled in and out of it.
      const renumbered = destination.map((item, position) => ({ ...item, position }));
      setItems((current) =>
        current
          .filter((i) => !renumbered.some((r) => r.id === i.id))
          .concat(renumbered)
      );

      void Promise.all(
        renumbered.map((item) => moveItem(supabase, item.id, item.rowId, item.position))
      );
    },
    [buckets, canEdit, items, supabase]
  );

  async function handleRename(rowId: string, label: string) {
    setRows((current) => current.map((r) => (r.id === rowId ? { ...r, label } : r)));
    if (supabase) await updateTierRow(supabase, rowId, { label });
  }

  async function handleRecolor(rowId: string, color: string) {
    setRows((current) => current.map((r) => (r.id === rowId ? { ...r, color } : r)));
    if (supabase) await updateTierRow(supabase, rowId, { color });
  }

  async function handleDeleteRow(rowId: string) {
    if (!supabase) return;
    await deleteTierRow(supabase, rowId);
    refresh();
  }

  async function handleAddRow() {
    if (!supabase) return;
    await addTierRow(supabase, board.list.id, rows.length);
    refresh();
  }

  async function handleHideItem(item: CustomItem, hidden: boolean) {
    if (!supabase) return;
    setItems((current) =>
      current.map((i) =>
        i.id === item.id ? { ...i, hiddenAt: hidden ? new Date().toISOString() : null } : i
      )
    );
    await setItemHidden(supabase, item.id, hidden);
  }

  async function handleDeleteItem(item: CustomItem) {
    if (!supabase) return;
    setItems((current) => current.filter((i) => i.id !== item.id));
    await deleteItem(supabase, item.id);
  }

  async function handleVisibility() {
    if (!supabase) return;
    const next = !isPublic;
    setIsPublic(next);
    await setBoardVisibility(supabase, board.list.id, next);
  }

  const pool = buckets.get(POOL_ID) ?? [];

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-10 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-4 md:pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{board.list.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {canEdit
              ? "Your own pictures, your own tiers. Drag a card to rank it."
              : "Someone else's board — shared with you by link."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button variant="secondary" size="sm" onClick={handleVisibility}>
                {isPublic ? (
                  <>
                    <Globe className="mr-1.5 h-4 w-4" aria-hidden />
                    Anyone with the link
                  </>
                ) : (
                  <>
                    <Lock className="mr-1.5 h-4 w-4" aria-hidden />
                    Only me
                  </>
                )}
              </Button>
              <UploadDialog listId={board.list.id} rows={rows} onUploaded={refresh} />
            </>
          )}
          {!canEdit && (
            <ReportButton
              subjectType="custom_list"
              subjectId={board.list.id}
              label="Report this board"
            />
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={tierCollisionDetection}
        onDragEnd={handleDragEnd}
      >
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <CustomTierRow
              key={row.id}
              row={row}
              items={buckets.get(row.id) ?? []}
              canEdit={canEdit}
              listId={board.list.id}
              onRename={handleRename}
              onRecolor={handleRecolor}
              onDeleteRow={handleDeleteRow}
              onUploaded={refresh}
              onHideItem={handleHideItem}
              onDeleteItem={handleDeleteItem}
            />
          ))}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleAddRow}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add a tier
          </button>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted">Unsorted</h2>
          <div
            ref={setPoolRef}
            className="mt-2 flex min-h-[140px] flex-wrap content-start gap-2 rounded-xl border border-dashed border-border p-3"
          >
            <SortableContext items={pool.map((i) => i.id)} strategy={rectSortingStrategy}>
              {pool.map((item) => (
                <CustomCard
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  onHide={handleHideItem}
                  onDelete={handleDeleteItem}
                />
              ))}
            </SortableContext>
            {pool.length === 0 && (
              <p className="m-auto text-xs text-muted">
                {canEdit
                  ? "Pictures you add without a tier wait here."
                  : "Nothing waiting to be sorted."}
              </p>
            )}
          </div>
        </section>
      </DndContext>
    </div>
  );
}
