import type { Metadata } from "next";
import { PublicTierListView } from "@/components/public-tier-list/public-tier-list-view";
import { defaultOgImage } from "@/lib/seo/og-image";

export async function generateMetadata(props: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await props.params;
  const title = `@${username}'s tier list — TierListOnline`;
  const description = `How @${username} ranks films, anime, games and YouTube channels.`;
  const path = `/u/${username}`;

  /*
   * Open Graph is spelled out rather than left to the root layout.
   *
   * Metadata merges shallowly, so a page that sets no `openGraph` inherits the
   * layout's whole block — which is how a link to someone's board came out
   * advertising the site instead of the board. Setting it here replaces that
   * block outright, which is also why the image has to be repeated: an
   * inherited half and a local half is not a thing Next produces.
   *
   * The image is still the generic banner. A board's own picture — the owner's
   * name over their S tier — belongs here eventually, and would be the version
   * of this that earns a click.
   */
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "profile",
      username,
      title,
      description,
      url: path,
      siteName: "TierListOnline",
      locale: "en_US",
      images: [defaultOgImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [defaultOgImage],
    },
  };
}

export default async function PublicProfilePage(props: PageProps<"/u/[username]">) {
  const { username } = await props.params;
  return <PublicTierListView username={username} />;
}
