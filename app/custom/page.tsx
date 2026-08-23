import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Lock } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listMyCustomBoards } from "@/lib/supabase/custom-lists";
import { CreateBoardForm } from "@/components/custom-list/create-board-form";

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

  const boards = await listMyCustomBoards(supabase, user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Custom tier lists</h1>
      <p className="mt-1 text-sm text-muted">
        Boards built from your own pictures, with tiers you name yourself.
      </p>

      <div className="mt-6">
        <CreateBoardForm />
      </div>

      <ul className="mt-6 space-y-2">
        {boards.map((board) => (
          <li key={board.id}>
            <Link
              href={`/custom/${board.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent/50"
            >
              <span className="truncate text-sm font-medium">{board.title}</span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                {board.isPublic ? (
                  <>
                    <Globe className="h-3.5 w-3.5" aria-hidden />
                    Anyone with the link
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                    Only me
                  </>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {boards.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Nothing here yet. Name a board above and start adding pictures.
        </p>
      )}
    </div>
  );
}
