import type { Metadata } from "next";
import { Images } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listMyCustomBoardSummaries } from "@/lib/supabase/custom-lists";
import { CreateBoardForm } from "@/components/custom-list/create-board-form";
import { BoardGrid } from "@/components/custom-list/board-grid";

/** Same reasoning as the board itself: these pages stay out of search results. */
export const metadata: Metadata = {
  title: "Custom tier lists — TierListOnline",
  robots: { index: false, follow: false },
};

export default async function CustomListsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  if (!supabase || !user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Custom tier lists</h1>
        <p className="mt-2 text-sm text-muted">
          Rank anything you like from your own pictures. Sign in to make one — the pictures are
          stored with your account, which is also what lets you take them down again.
        </p>
      </div>
    );
  }

  const boards = await listMyCustomBoardSummaries(supabase, user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Images className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Custom tier lists</h1>
          <p className="mt-1 text-sm text-muted">
            Boards built from your own pictures, with tiers you name yourself.
          </p>
        </div>
      </header>

      <div className="mt-6">
        <CreateBoardForm />
      </div>

      {boards.length > 0 ? (
        <>
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted">
            {boards.length === 1 ? "Your board" : `Your boards — ${boards.length}`}
          </h2>
          <div className="mt-3">
            <BoardGrid boards={boards} />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-2xl border border-border bg-surface/50 px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-raised text-muted">
            <Images className="h-6 w-6" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium">No boards yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Name one above and start adding pictures. Anything can be a tier list — holidays,
            haircuts, every sandwich you had this year.
          </p>
        </div>
      )}
    </div>
  );
}
