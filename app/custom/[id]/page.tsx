import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCustomBoard } from "@/lib/supabase/custom-lists";
import { CustomBoard } from "@/components/custom-list/custom-board";

/**
 * Someone's own board, reachable by its link.
 *
 * `noindex`, deliberately and unconditionally — including for a board its owner
 * marked public. Those are two different questions: "may anyone who has the
 * link open this" is the owner's to answer, and "may this appear in search
 * results" is the platform's. Until uploads are checked by something other than
 * a checkbox, the platform's answer is no, and this route is kept out of the
 * sitemap to match.
 */
export const metadata: Metadata = {
  title: "Custom tier list — TierListOnline",
  robots: { index: false, follow: false },
};

export default async function CustomListPage({ params }: PageProps<"/custom/[id]">) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const board = await getCustomBoard(supabase, id, user?.id ?? null);
  // A hidden board is gone as far as anyone but an operator is concerned, and
  // a private one belongs to somebody else — both are simply not here.
  if (!board || (board.list.hiddenAt !== null && !board.canEdit)) notFound();

  return <CustomBoard board={board} />;
}
