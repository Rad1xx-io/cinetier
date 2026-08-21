"use client";

import { useEffect, useRef } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { RANKINGS_CHANGED_EVENT } from "@/lib/storage/local-storage-repository";
import { getRatedTitles, reorderAll } from "@/lib/storage";
import { pullCloudTitles, pushCloudTitles } from "@/lib/storage/cloud-sync";
import { CHANNEL_RANKINGS_CHANGED_EVENT } from "@/lib/storage/youtube/local-storage-repository";
import { getRatedChannels, reorderAllChannels } from "@/lib/storage/youtube";
import { pullCloudChannels, pushCloudChannels } from "@/lib/storage/youtube/cloud-sync";
import {
  clearLocalOwner,
  ensureLocalOwner,
  readLocalOwner,
  stampLocalOwner,
} from "@/lib/storage/local-owner";
import { decideSync } from "@/lib/storage/sync-decision";

const PUSH_DEBOUNCE_MS = 600;

/**
 * Renders nothing — mounted once in the root layout to keep localStorage and
 * Supabase in sync while signed in. Local-first: localStorage stays the
 * synchronous source of truth the UI reads; this only mirrors it to the cloud
 * in the background and pulls down on sign-in.
 *
 * Every write here answers one question first: whose board is this? The
 * rankings carry an owner marker (see lib/storage/local-owner) because the
 * cloud being empty says nothing about that — it used to be read as "this must
 * be your guest board", which in a browser somebody else had signed into
 * copied their board into the account that had just arrived.
 */
export function CloudSyncProvider() {
  const userIdRef = useRef<string | null>(null);
  const titlesPushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelsPushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingDownRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    /*
     * Settle ownership before any auth event can arrive. A browser that is
     * empty right now becomes a guest, so a first-time visitor's board is
     * attributable from its first entry and still adopts correctly when they
     * sign up.
     */
    ensureLocalOwner(getRatedTitles().length > 0 || getRatedChannels().length > 0);

    function cancelPendingPushes() {
      if (titlesPushTimeoutRef.current) clearTimeout(titlesPushTimeoutRef.current);
      if (channelsPushTimeoutRef.current) clearTimeout(channelsPushTimeoutRef.current);
      titlesPushTimeoutRef.current = null;
      channelsPushTimeoutRef.current = null;
    }

    /** Wipes the board without letting the write escape to anyone's cloud. */
    function clearLocalBoards() {
      syncingDownRef.current = true;
      try {
        reorderAll([]);
        reorderAllChannels([]);
      } finally {
        syncingDownRef.current = false;
      }
    }

    async function syncDown(userId: string) {
      syncingDownRef.current = true;
      try {
        const localTitles = getRatedTitles();
        const localChannels = getRatedChannels();
        const owner = ensureLocalOwner(localTitles.length > 0 || localChannels.length > 0);

        const [titlePull, channelPull] = await Promise.all([
          pullCloudTitles(userId),
          pullCloudChannels(userId),
        ]);

        const titles = decideSync(owner, titlePull, localTitles.length, userId);
        const channels = decideSync(owner, channelPull, localChannels.length, userId);

        /*
         * One failed read stops both halves. A dropped request is not evidence
         * of an empty account, and applying half a sync would leave the board
         * in a state neither the cloud nor this browser ever held.
         */
        if (titles.action === "abort" || channels.action === "abort") {
          console.error(
            "TierListOnline: sign-in sync aborted, local board left untouched —",
            titles.reason,
            channels.reason
          );
          return;
        }

        if (titles.action === "adopt") await pushCloudTitles(userId, localTitles);
        else if (titles.action === "replace" && titlePull.status === "ok") reorderAll(titlePull.items);
        else if (titles.action === "discard-local") reorderAll([]);

        if (channels.action === "adopt") await pushCloudChannels(userId, localChannels);
        else if (channels.action === "replace" && channelPull.status === "ok") {
          reorderAllChannels(channelPull.items);
        } else if (channels.action === "discard-local") reorderAllChannels([]);

        // Whatever is on the board now is this account's.
        stampLocalOwner(userId);
      } finally {
        syncingDownRef.current = false;
      }
    }

    /**
     * Ends the session's claim on this browser.
     *
     * Called for a real sign-out and for arriving with no session at all,
     * which is what a closed tab, a crash or an expired token looks like from
     * here. The board goes with it: it is safe in that account's cloud, and
     * leaving it on screen is what let the next person to sign in inherit it.
     *
     * The identity is dropped before anything else so the clear cannot be
     * mistaken for an edit and pushed up — that push would delete the departing
     * account's rankings from the cloud.
     */
    function releaseSession() {
      userIdRef.current = null;
      cancelPendingPushes();

      const owner = readLocalOwner();
      if (owner?.kind === "user") clearLocalBoards();
      clearLocalOwner();
    }

    function scheduleTitlesPush() {
      if (!userIdRef.current || syncingDownRef.current) return;
      if (titlesPushTimeoutRef.current) clearTimeout(titlesPushTimeoutRef.current);
      const userId = userIdRef.current;
      titlesPushTimeoutRef.current = setTimeout(() => {
        if (!ownsThisSession(userId)) return;
        void pushCloudTitles(userId, getRatedTitles());
      }, PUSH_DEBOUNCE_MS);
    }

    function scheduleChannelsPush() {
      if (!userIdRef.current || syncingDownRef.current) return;
      if (channelsPushTimeoutRef.current) clearTimeout(channelsPushTimeoutRef.current);
      const userId = userIdRef.current;
      channelsPushTimeoutRef.current = setTimeout(() => {
        if (!ownsThisSession(userId)) return;
        void pushCloudChannels(userId, getRatedChannels());
      }, PUSH_DEBOUNCE_MS);
    }

    /**
     * Re-checks, at the moment of writing, that the board still belongs to the
     * account this push was scheduled for. Half a second is long enough for a
     * sign-out, or for another tab to hand the browser to somebody else.
     */
    function ownsThisSession(userId: string): boolean {
      if (userIdRef.current !== userId) return false;
      const owner = readLocalOwner();
      return owner?.kind === "user" && owner.userId === userId;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        userIdRef.current = session.user.id;
        void syncDown(session.user.id);
      } else {
        releaseSession();
      }
    });

    window.addEventListener(RANKINGS_CHANGED_EVENT, scheduleTitlesPush);
    window.addEventListener(CHANNEL_RANKINGS_CHANGED_EVENT, scheduleChannelsPush);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener(RANKINGS_CHANGED_EVENT, scheduleTitlesPush);
      window.removeEventListener(CHANNEL_RANKINGS_CHANGED_EVENT, scheduleChannelsPush);
      cancelPendingPushes();
    };
  }, []);

  return null;
}
