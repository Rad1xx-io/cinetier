import type { Metadata } from "next";
import { FeedView } from "@/components/feed/feed-view";

export const metadata: Metadata = {
  title: "Community — TierListOnline",
  description: "Other people's tier lists — read them, argue in the comments, fork one for yourself.",
};

export default function FeedPage() {
  return <FeedView />;
}
