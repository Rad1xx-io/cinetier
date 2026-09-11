import type { Metadata } from "next";
import { VotingSessionView } from "@/components/voting/voting-session-view";

export const metadata: Metadata = {
  title: "Group vote — TierListOnline",
  description: "Vote on this line-up, no account needed, and see how the group ranked it once voting closes.",
};

export default async function VotingSessionPage(props: PageProps<"/vote/[id]">) {
  const { id } = await props.params;
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <VotingSessionView sessionId={id} />
    </div>
  );
}
