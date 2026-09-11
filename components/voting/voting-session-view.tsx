"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Share2, TriangleAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VotingBallot } from "@/components/voting/voting-ballot";
import { VotingResults } from "@/components/voting/voting-results";
import { closeVotingSession, getVotingSession, submitBallot } from "@/lib/supabase/voting";
import { hasVotedLocally } from "@/lib/voting/voter-key";
import { trackVotingBallotSubmitted, trackVotingSessionClosed, trackLinkCopied, trackShareClicked } from "@/lib/analytics/events";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { shareUrl } from "@/lib/seo/site";
import type { VotingRatings, VotingSession } from "@/lib/types/voting";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; session: VotingSession };

function canWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Owns the whole life of a session on screen: open (voting or, for the
 * creator, managing the link) and closed (the result). No live-updating
 * anywhere in here on purpose — see migration 033's header — so a voter who
 * wants to know whether the room has closed since they last looked reloads
 * the page, the same as a Battle link works today.
 */
export function VotingSessionView({ sessionId }: { sessionId: string }) {
  const { user } = useSupabaseSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [voted, setVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getVotingSession(sessionId).then((session) => {
      if (cancelled) return;
      setState(session ? { status: "ready", session } : { status: "missing" });
      setVoted(hasVotedLocally(sessionId));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.status === "loading") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <TriangleAlert className="h-6 w-6 text-muted" aria-hidden />
        <p className="text-sm text-muted">
          This voting link doesn&apos;t exist, or it isn&apos;t available anymore.
        </p>
      </div>
    );
  }

  const { session } = state;
  const isCreator = Boolean(user && user.id === session.creatorId);
  const link = shareUrl(`/vote/${session.id}`);

  async function handleSubmit(ratings: VotingRatings) {
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitBallot(session.id, ratings);
    setSubmitting(false);

    if (result.ok) {
      setVoted(true);
      trackVotingBallotSubmitted({
        sessionId: session.id,
        itemsRated: Object.keys(ratings).length,
        itemsInPool: session.pool.length,
      });
      return;
    }

    if (result.reason === "already-voted") {
      // The server is the real source of truth (see submitBallot) — this
      // browser's own local memory said otherwise, so it was corrected here
      // rather than trusted.
      setVoted(true);
      return;
    }
    if (result.reason === "closed") {
      setState({ status: "ready", session: { ...session, closedAt: new Date().toISOString() } });
      return;
    }
    setSubmitError("Could not submit your ballot. Check your connection and try again.");
  }

  async function handleClose() {
    setClosing(true);
    setCloseError(null);
    const result = await closeVotingSession(session.id);
    setClosing(false);

    if (!result.ok) {
      setCloseError(
        result.reason === "already-closed"
          ? "This session was already closed."
          : result.reason === "not-creator"
            ? "Only the creator can close this session."
            : "Could not close the session. Check your connection and try again."
      );
      return;
    }

    trackVotingSessionClosed({ sessionId: session.id, resultPostId: result.postId });
    setState({
      status: "ready",
      session: { ...session, closedAt: new Date().toISOString(), resultPostId: result.postId },
    });
  }

  async function handleShare() {
    trackShareClicked("tier_list", session.id);
    if (canWebShare()) {
      try {
        await navigator.share({ title: session.title, text: "Vote on this line-up:", url: link });
        return;
      } catch {
        // A dismissed share sheet rejects too — fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      trackLinkCopied("tier_list", session.id);
      setCopied(true);
    } catch {
      window.prompt("Copy the link:", link);
    }
  }

  if (session.closedAt) {
    return session.resultPostId ? (
      <VotingResults postId={session.resultPostId} />
    ) : (
      <p className="text-sm text-muted">This session closed, but the result could not be found.</p>
    );
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Users className="h-4 w-4 text-accent" aria-hidden />
        {session.title}
      </h1>
      {session.description && <p className="mt-1 text-sm text-muted">{session.description}</p>}

      {isCreator && (
        <div className="mt-3 rounded-lg border border-border bg-surface-raised p-3">
          <p className="truncate text-sm">{link}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="secondary" onClick={handleShare}>
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : canWebShare() ? (
                <Share2 className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied ? "Copied" : "Share"}
            </Button>
            <Button size="sm" onClick={handleClose} disabled={closing}>
              {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Close voting and see the result
            </Button>
          </div>
          {closeError && <p className="mt-2 text-xs text-tier-s">{closeError}</p>}
        </div>
      )}

      <div className="mt-4">
        {voted ? (
          <p className="rounded-lg border border-border bg-surface-raised px-3 py-3 text-sm text-muted">
            Your ballot is in. {isCreator ? "Close voting above whenever you're ready to see the result." : "Check back once the creator closes the vote to see how it landed."}
          </p>
        ) : (
          <>
            <VotingBallot pool={session.pool} submitting={submitting} onSubmit={handleSubmit} />
            {submitError && <p className="mt-2 text-xs text-tier-s">{submitError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
