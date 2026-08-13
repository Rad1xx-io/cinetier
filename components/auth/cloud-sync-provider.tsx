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

const PUSH_DEBOUNCE_MS = 600;

/**
 * Renders nothing — mounted once in the root layout to keep localStorage and
 * Supabase in sync while signed in. Local-first: localStorage stays the
 * synchronous source of truth the UI reads; this only mirrors it to the cloud
 * in the background and pulls down on sign-in. Handles every ranking
 * category (movies/TV, YouTube channels, ...) off the same auth session —
 * one listener, independent debounced push per category.
 *
 * On first sign-in: cloud empty + local has data -> push local up (adopt the
 * guest session into the account). Otherwise cloud wins and overwrites local
 * — kept deliberately simple for v1, no field-by-field merge across devices.
 */
export function CloudSyncProvider() {
  const userIdRef = useRef<string | null>(null);
  const titlesPushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelsPushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingDownRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    async function syncDown(userId: string) {
      syncingDownRef.current = true;
      try {
        const [cloudTitles, cloudChannels] = await Promise.all([
          pullCloudTitles(userId),
          pullCloudChannels(userId),
        ]);

        const localTitles = getRatedTitles();
        if (cloudTitles.length === 0 && localTitles.length > 0) {
          await pushCloudTitles(userId, localTitles);
        } else {
          reorderAll(cloudTitles);
        }

        const localChannels = getRatedChannels();
        if (cloudChannels.length === 0 && localChannels.length > 0) {
          await pushCloudChannels(userId, localChannels);
        } else {
          reorderAllChannels(cloudChannels);
        }
      } finally {
        syncingDownRef.current = false;
      }
    }

    function scheduleTitlesPush() {
      if (!userIdRef.current || syncingDownRef.current) return;
      if (titlesPushTimeoutRef.current) clearTimeout(titlesPushTimeoutRef.current);
      const userId = userIdRef.current;
      titlesPushTimeoutRef.current = setTimeout(() => {
        void pushCloudTitles(userId, getRatedTitles());
      }, PUSH_DEBOUNCE_MS);
    }

    function scheduleChannelsPush() {
      if (!userIdRef.current || syncingDownRef.current) return;
      if (channelsPushTimeoutRef.current) clearTimeout(channelsPushTimeoutRef.current);
      const userId = userIdRef.current;
      channelsPushTimeoutRef.current = setTimeout(() => {
        void pushCloudChannels(userId, getRatedChannels());
      }, PUSH_DEBOUNCE_MS);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        userIdRef.current = session.user.id;
        void syncDown(session.user.id);
      } else {
        userIdRef.current = null;
      }
    });

    window.addEventListener(RANKINGS_CHANGED_EVENT, scheduleTitlesPush);
    window.addEventListener(CHANNEL_RANKINGS_CHANGED_EVENT, scheduleChannelsPush);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener(RANKINGS_CHANGED_EVENT, scheduleTitlesPush);
      window.removeEventListener(CHANNEL_RANKINGS_CHANGED_EVENT, scheduleChannelsPush);
      if (titlesPushTimeoutRef.current) clearTimeout(titlesPushTimeoutRef.current);
      if (channelsPushTimeoutRef.current) clearTimeout(channelsPushTimeoutRef.current);
    };
  }, []);

  return null;
}
