import type { Metadata } from "next";
import { FeedView } from "@/components/feed/feed-view";
import { getInitialFeed } from "@/lib/supabase/public-read";

export const metadata: Metadata = {
  title: "Community — TierListOnline",
  description: "Other people's tier lists — read them, argue in the comments, fork one for yourself.",
};

/*
 * Rendered per request rather than prerendered.
 *
 * `getInitialFeed` reads through a session-less client with no `cookies()` or
 * other dynamic API in sight — exactly what would otherwise let Next treat
 * this as static and bake whichever posts existed at build time into the
 * page once, for good, the same bailout `/discover` and `/games` already
 * document for their own reason. A community feed that stops updating the
 * moment someone deploys is a worse bug than the one this whole change set
 * exists to fix.
 */
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  // The "All" tab's first page, read on the server so a crawler's raw HTML
  // carries real post titles and authors instead of only the Skeleton this
  // page rendered before — everything else (other tabs, likes, board
  // previews) still comes from the client the same way it always has.
  const initialPosts = await getInitialFeed();
  return <FeedView initialPosts={initialPosts ?? undefined} />;
}
