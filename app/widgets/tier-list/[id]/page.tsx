import type { Metadata } from "next";
import { WidgetTierList } from "@/components/widgets/widget-tier-list";
import { parseWidgetParams } from "@/lib/widgets/params";

/**
 * `noindex` on purpose. This URL exists to be pasted into OBS, and a search
 * result pointing at a chromeless overlay helps nobody.
 */
export const metadata: Metadata = {
  title: "Виджет тир-листа — CineTier",
  robots: { index: false, follow: false },
};

/**
 * The OBS browser-source page.
 *
 * `[id]` is a public handle: a board in CineTier belongs to a user and has no
 * id of its own, so /widgets/tier-list/someone mirrors /u/someone.
 */
export default async function TierListWidgetPage(props: PageProps<"/widgets/tier-list/[id]">) {
  const { id } = await props.params;
  const params = parseWidgetParams(await props.searchParams);

  return <WidgetTierList listId={id} params={params} />;
}
