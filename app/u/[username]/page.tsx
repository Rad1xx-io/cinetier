import type { Metadata } from "next";
import { PublicTierListView } from "@/components/public-tier-list/public-tier-list-view";

export async function generateMetadata(props: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await props.params;
  return {
    title: `@${username}'s tier list — TierListOnline`,
    description: `How @${username} ranks films, anime, games and YouTube channels.`,
  };
}

export default async function PublicProfilePage(props: PageProps<"/u/[username]">) {
  const { username } = await props.params;
  return <PublicTierListView username={username} />;
}
