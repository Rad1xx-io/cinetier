"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, MonitorPlay, Send, Share2, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UsernameDialog } from "@/components/profile/username-dialog";
import { WidgetEmbedDialog } from "@/components/widgets/widget-embed-dialog";
import { CreateBattleModal } from "@/components/battle/create-battle-modal";
import { PublishPostDialog } from "@/components/feed/publish-post-dialog";
import { suggestedPostCategory } from "@/lib/feed/post-preview";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { getMyProfile, type Profile } from "@/lib/supabase/profiles";
import {
  trackImageExported,
  trackLinkCopied,
  trackShareClicked,
} from "@/lib/analytics/events";
import type { RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import { shareUrl } from "@/lib/seo/site";
import { describeExportFailure } from "@/lib/utils/export-error";
import { downloadPng, renderBoardPng } from "@/lib/utils/board-export";

interface TierListActionsProps {
  /** The element to rasterise — the tier rows only, without the toolbar. */
  boardRef: React.RefObject<HTMLElement | null>;
  onNotify: (message: string) => void;
  /** The ranked pool a battle is built from — both stores, since a battle can
   *  be about channels as easily as films. */
  titles: RankedTitle[];
  channels: RankedChannel[];
}

export function TierListActions({
  boardRef,
  onNotify,
  titles,
  channels,
}: TierListActionsProps) {
  const { user } = useSupabaseSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [battleOpen, setBattleOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyProfile(user.id).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Derived rather than stored, so signing out clears the handle without an
  // extra effect writing state during render.
  const shareHandle = user && profile?.isPublic ? profile.username : null;

  const copyLink = useCallback(
    async (handle: string) => {
      const url = shareUrl(`/u/${handle}`);
      // Counted before the write: a clipboard refusal still falls back to
      // showing the link, so the user got their link either way.
      trackLinkCopied("tier_list", handle);
      try {
        await navigator.clipboard.writeText(url);
        onNotify("Link copied");
      } catch {
        // Clipboard access can be refused (insecure origin, denied permission);
        // showing the link is better than failing silently.
        onNotify(url);
      }
    },
    [onNotify]
  );

  const handleExport = useCallback(async () => {
    const node = boardRef.current;
    if (!node) {
      // Reachable since the board stopped rendering rows for an empty list:
      // there is genuinely nothing to photograph, and a button that does
      // nothing at all reads as broken.
      onNotify("There is nothing on this list to export.");
      return;
    }

    const itemsCount = titles.length + channels.length;

    setExporting(true);
    // The watermark sits in the DOM at zero opacity so it never disturbs the
    // live layout; it is only made visible for the duration of the capture.
    const watermark = node.querySelector<HTMLElement>("[data-export-watermark]");
    if (watermark) watermark.style.opacity = "1";

    try {
      const dataUrl = await renderBoardPng(node);
      downloadPng(dataUrl, "tierlistonline");
      trackImageExported({ itemsCount, succeeded: true });
      onNotify("Image saved");
    } catch (err) {
      const reason = describeExportFailure(err);
      trackImageExported({ itemsCount, succeeded: false, reason: reason.slice(0, 120) });
      onNotify(
        reason === "export-timeout"
          ? "The image did not finish rendering. Use “Copy link” to share your board instead."
          : `Could not create the image (${reason.slice(0, 80)}). Use “Copy link” instead.`
      );
    } finally {
      if (watermark) watermark.style.opacity = "0";
      setExporting(false);
    }
  }, [boardRef, onNotify, titles.length, channels.length]);

  const handleShare = useCallback(() => {
    // Fired on every press, including the ones that end at the username dialog
    // or the sign-in prompt — those are exactly the drop-offs worth seeing.
    trackShareClicked("tier_list", shareHandle ?? "unclaimed");
    if (shareHandle) {
      void copyLink(shareHandle);
      return;
    }
    if (user) {
      // No handle yet — take the claim inline instead of sending them away.
      setDialogOpen(true);
      return;
    }
    onNotify("Sign in to get a link to your tier list");
  }, [shareHandle, user, copyLink, onNotify]);

  const handleStartBattle = useCallback(() => {
    // Same gate as sharing: a battle row is owned by its creator, so there is
    // nothing to insert without a session.
    if (!user) {
      onNotify("Sign in to create a battle");
      return;
    }
    setBattleOpen(true);
  }, [user, onNotify]);

  const handlePublish = useCallback(() => {
    // Same gate as the rest: a post is owned by its author and signed with their
    // handle, so there is nothing to insert without a session.
    if (!user) {
      onNotify("Sign in to publish a post");
      return;
    }
    setPublishOpen(true);
  }, [user, onNotify]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden />
        )}
        Download PNG
      </Button>

      <Button variant="secondary" size="sm" onClick={handleShare}>
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        Copy link
      </Button>

      <Button variant="secondary" size="sm" onClick={handlePublish}>
        <Send className="h-3.5 w-3.5" aria-hidden />
        Publish
      </Button>

      {/* Only offered once the board is public: the widget reads the same page
          a visitor would, so on a closed profile it would render nothing. */}
      {shareHandle && (
        <Button variant="secondary" size="sm" onClick={() => setWidgetOpen(true)}>
          <MonitorPlay className="h-3.5 w-3.5" aria-hidden />
          OBS widget
        </Button>
      )}

      <Button size="sm" onClick={handleStartBattle} className="relative">
        <Swords className="h-3.5 w-3.5" aria-hidden />
        Taste Battle
        {/* The one action here that brings other people in, so it gets the only
            accent button and a marker drawing the eye to it. */}
        <span className="absolute -right-1 -top-1 rounded-full bg-tier-s px-1 py-px text-[9px] font-bold uppercase leading-tight text-white">
          new
        </span>
      </Button>

      {shareHandle && (
        <WidgetEmbedDialog
          isOpen={widgetOpen}
          onClose={() => setWidgetOpen(false)}
          listId={shareHandle}
        />
      )}

      <PublishPostDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        suggestedCategory={suggestedPostCategory(titles, channels)}
      />

      <CreateBattleModal
        open={battleOpen}
        onClose={() => setBattleOpen(false)}
        titles={titles}
        channels={channels}
      />

      {user && (
        <UsernameDialog
          userId={user.id}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={(p) => {
            setProfile(p);
            void copyLink(p.username);
          }}
        />
      )}
    </div>
  );
}
