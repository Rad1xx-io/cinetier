/**
 * Boards built from the owner's own pictures, rather than from a catalogue.
 *
 * Deliberately a separate shape from `RankedTitle`. A ranked title is a pointer
 * into TMDB or IGDB — the picture, the name and the year all belong to a
 * catalogue and can be fetched again. A custom card owns its picture, and the
 * only thing that knows what it is, is the row in the database.
 */

export interface CustomTierList {
  id: string;
  userId: string;
  title: string;
  /** Who may open the link. Never who may index it — these pages are noindex. */
  isPublic: boolean;
  hiddenAt: string | null;
  updatedAt: string;
}

export interface CustomTierRow {
  id: string;
  listId: string;
  position: number;
  label: string;
  color: string;
  /** A tier can show a picture instead of a letter. Path within the bucket. */
  imagePath: string | null;
  /** Signed, short-lived, and absent when the tier has no picture. */
  imageUrl: string | null;
}

export interface CustomItem {
  id: string;
  listId: string;
  /** Null while the card sits in the unassigned pool below the board. */
  rowId: string | null;
  position: number;
  caption: string;
  imagePath: string;
  /** Signed and short-lived; null if the url could not be issued. */
  imageUrl: string | null;
  hiddenAt: string | null;
}

/** Everything one board page needs, resolved together. */
export interface CustomBoard {
  list: CustomTierList;
  rows: CustomTierRow[];
  items: CustomItem[];
  /** Whether the viewer may rearrange any of it. */
  canEdit: boolean;
}

/** The tiers a new board starts with — recognisable, and all renameable. */
export const STARTER_ROWS: { label: string; color: string }[] = [
  { label: "S", color: "#ef4444" },
  { label: "A", color: "#f59e0b" },
  { label: "B", color: "#eab308" },
  { label: "C", color: "#22c55e" },
  { label: "D", color: "#3b82f6" },
];

/** Shared with the community feed's posts and comments, not only custom boards. */
export type ReportSubjectType = "custom_item" | "custom_list" | "post" | "post_comment";
