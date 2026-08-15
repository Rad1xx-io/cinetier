import type { Metadata } from "next";
import { BattleView } from "@/components/battle/battle-view";

export const metadata: Metadata = {
  title: "Taste Battle — TierListOnline",
  description: "Rate the same line-up the author did and see how closely your tastes match.",
};

export default async function BattlePage(props: PageProps<"/battle/[id]">) {
  const { id } = await props.params;
  return <BattleView battleId={id} />;
}
