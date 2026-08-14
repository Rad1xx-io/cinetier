import type { Metadata } from "next";
import { BattleView } from "@/components/battle/battle-view";

export const metadata: Metadata = {
  title: "Батл вкусов — CineTier",
  description: "Оцените тот же набор, что и автор, и узнайте, насколько совпали ваши вкусы.",
};

export default async function BattlePage(props: PageProps<"/battle/[id]">) {
  const { id } = await props.params;
  return <BattleView battleId={id} />;
}
