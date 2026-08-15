import type { Metadata } from "next";
import { PublicTierListView } from "@/components/public-tier-list/public-tier-list-view";

export async function generateMetadata(props: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await props.params;
  return {
    title: `Тир-лист @${username} — TierListOnline`,
    description: `Личный рейтинг фильмов, аниме, игр и YouTube-каналов пользователя @${username}.`,
  };
}

export default async function PublicProfilePage(props: PageProps<"/u/[username]">) {
  const { username } = await props.params;
  return <PublicTierListView username={username} />;
}
