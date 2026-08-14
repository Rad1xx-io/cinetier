"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForkConflictDialog } from "@/components/public-tier-list/fork-conflict-dialog";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useRankedChannels } from "@/lib/hooks/use-ranked-channels";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { pushCloudTitles } from "@/lib/storage/cloud-sync";
import { pushCloudChannels } from "@/lib/storage/youtube/cloud-sync";
import { forkChannels, forkTitles, type ForkStrategy } from "@/lib/storage/fork";
import { armForkInteraction, dominantCategory, setForkToast } from "@/lib/storage/fork-handoff";
import { trackForkClicked, trackForkCreated } from "@/lib/analytics/events";
import { titlesCountLabel } from "@/lib/utils/pluralize-ru";
import type { RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { Profile } from "@/lib/supabase/profiles";

interface ForkButtonProps {
  profile: Profile;
  /** The author's titles, exactly as the page rendered them. */
  sourceTitles: RankedTitle[];
  /** And their channels — a board holds both, so a fork copies both. */
  sourceChannels: RankedChannel[];
}

/**
 * Copies someone else's board onto your own.
 *
 * Open to guests on purpose: the ranking lives in localStorage first, so a
 * visitor with no account gets a working copy immediately and an account only
 * changes whether it also reaches the cloud. Gating this behind sign-in would
 * put a wall in front of the one action that makes a shared list worth sharing.
 */
export function ForkButton({ profile, sourceTitles, sourceChannels }: ForkButtonProps) {
  const router = useRouter();
  const { titles, reorderAll, hydrated } = useRankedTitles();
  const { channels, reorderAll: reorderAllChannels } = useRankedChannels();
  const { user } = useSupabaseSession();
  const [conflictOpen, setConflictOpen] = useState(false);
  const [working, setWorking] = useState(false);

  function handleClick() {
    trackForkClicked(profile.username, profile.id);

    // Nothing of the viewer's own is at risk, so no question is worth asking.
    if (titles.length === 0 && channels.length === 0) {
      applyFork("replace");
      return;
    }
    setConflictOpen(true);
  }

  function applyFork(strategy: ForkStrategy) {
    setConflictOpen(false);
    setWorking(true);

    const forkedTitles = forkTitles(titles, sourceTitles, strategy);
    const forkedChannels = forkChannels(channels, sourceChannels, strategy);

    // localStorage first, exactly like every other write in the app: the board
    // is correct the moment the user arrives, with or without a connection.
    reorderAll(forkedTitles.items);
    reorderAllChannels(forkedChannels.items);

    if (user) {
      // Background on purpose — the copy already exists locally, and blocking
      // the redirect on a round trip would make a local operation feel remote.
      void pushCloudTitles(user.id, forkedTitles.items);
      void pushCloudChannels(user.id, forkedChannels.items);
    }

    trackForkCreated(profile.username, user?.id ?? "local");
    armForkInteraction({
      originalListId: profile.username,
      category: dominantCategory(forkedTitles.items, forkedChannels.items),
    });

    const added = forkedTitles.added + forkedChannels.added;
    const kept = forkedTitles.kept + forkedChannels.kept;
    setForkToast(
      strategy === "replace"
        ? `Скопировано: ${titlesCountLabel(added)}`
        : `Добавлено ${added}, ваши ${kept} сохранены`
    );

    router.push("/tier-list");
  }

  const displayName = profile.displayName || `@${profile.username}`;

  // Shown disabled rather than hidden: a missing button reads as a bug, while a
  // disabled one with a reason tells the visitor the author made a choice.
  if (!profile.allowFork) {
    return (
      <Button variant="secondary" disabled title="Автор запретил форк своего списка">
        <Lock className="h-4 w-4" aria-hidden />
        Форк отключён автором
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={!hydrated || working || sourceTitles.length + sourceChannels.length === 0}
      >
        {working ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <GitFork className="h-4 w-4" aria-hidden />
        )}
        Форкнуть тир-лист
      </Button>

      <ForkConflictDialog
        open={conflictOpen}
        onClose={() => setConflictOpen(false)}
        onChoose={applyFork}
        currentCount={titles.length + channels.length}
        incomingCount={sourceTitles.length + sourceChannels.length}
        authorName={displayName}
      />
    </>
  );
}
