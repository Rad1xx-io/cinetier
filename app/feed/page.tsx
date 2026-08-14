import type { Metadata } from "next";
import { FeedView } from "@/components/feed/feed-view";

export const metadata: Metadata = {
  title: "Сообщество — CineTier",
  description: "Тир-листы других людей: посмотрите, поспорьте в комментариях, заберите себе.",
};

export default function FeedPage() {
  return <FeedView />;
}
