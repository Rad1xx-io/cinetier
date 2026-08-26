"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Eraser, Images, MonitorPlay, Send, Share2, Swords } from "lucide-react";
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
import { OverflowMenu } from "@/components/ui/overflow-menu";
import Link from "next/link";
import { downloadPng, renderBoardPng } from "@/lib/utils/board-export";
import { getRatedTitles, reorderAll } from "@/lib/storage";
import { clearAllChannels } from "@/lib/storage/youtube";
import type { ContentType } from "@/lib/utils/content-type";

/**
 * What one item of a catalog is called in the Clear List confirmation.
 *
 * An adjective before "title" for every catalog but YouTube, which counts
 * channels rather than titles — "12 YouTube titles" is not what is on the
 * board, "12 YouTube channels" is.
 */
const CLEAR_LIST_NOUN: Record<ContentType, { singular: string; plural: string }> = {
  movie: { singular: "Film title", plural: "Film titles" },
  tv: { singular: "TV title", plural: "TV titles" },
  anime: { singular: "Anime title", plural: "Anime titles" },
  game: { singular: "Game title", plural: "Game titles" },
  youtube: { singular: "YouTube channel", plural: "YouTube channels" },
};

interface TierListActionsProps {
  /** The element to rasterise — the tier rows only, without the toolbar. */
  boardRef: React.RefObject<HTMLElement | null>;
  onNotify: (message: string) => void;
  /** The ranked pool a battle is built from — both stores, since a battle can
   *  be about channels as easily as films. */
  titles: RankedTitle[];
  channels: RankedChannel[];
  /**
   * The catalog the board is currently showing.
   *
   * This page holds one unified list across every catalog, but there is
   * deliberately no "everything at once" view of it — the picker always shows
   * exactly one (`CATALOG_FILTERS` has no "all" entry, on purpose: a tier
   * holding films, games and channels side by side was never a ranking of
   * anything). Clear List is scoped to this because of that — there is no
   * other state for it to fall back to.
   */
  category: ContentType;
}

export function TierListActions({
  boardRef,
  onNotify,
  titles,
  channels,
  category,
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

  /*
   * "This list" reported production behaviour and this behaviour disagreed:
   * clicking Clear List while looking at Films wiped TV, Anime, Games and
   * YouTube too, and said so honestly in a dialog that read "all 52 titles"
   * to someone looking at one. It cleared the whole store because that is
   * the only thing it had ever been asked to clear — the picker's category
   * never reached it.
   *
   * There is no "show everything" state this could fall back to instead: the
   * category prop above is one of the five catalogs, always, because the
   * picker itself has no "all" entry to select. So this is not "scoped when
   * a filter happens to be on" — every visit to this page is already scoped
   * to one catalog, and Clear List now agrees with what is on screen.
   */
  const clearableCount =
    category === "youtube" ? channels.length : titles.filter((t) => t.mediaType === category).length;
  const clearNoun = CLEAR_LIST_NOUN[category];

  const handleClearList = useCallback(() => {
    if (clearableCount === 0) return;
    const confirmed = window.confirm(
      `Remove all ${clearableCount} ${clearableCount === 1 ? clearNoun.singular : clearNoun.plural} ` +
        `from this list? Everything else on the board stays where it is. This cannot be undone.`
    );
    if (!confirmed) return;
    if (category === "youtube") clearAllChannels();
    else reorderAll(getRatedTitles().filter((t) => t.mediaType !== category));
  }, [clearableCount, clearNoun, category]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        * A second entry point, not a second category. Custom boards are not
        * ranked from a catalogue — this button is the only way into them from
        * here, now that they have no place of their own in the navigation.
        */}
      <Button variant="secondary" size="sm" asChild>
        <Link href="/custom">
          <Images className="h-3.5 w-3.5" aria-hidden />
          Custom
        </Link>
      </Button>

      <Button variant="secondary" size="sm" onClick={handlePublish}>
        <Send className="h-3.5 w-3.5" aria-hidden />
        Publish
      </Button>

      <Button size="sm" onClick={handleStartBattle} className="relative">
        <Swords className="h-3.5 w-3.5" aria-hidden />
        Taste Battle
        {/* The one action here that brings other people in, so it gets the only
            accent button and a marker drawing the eye to it. */}
        <span className="absolute -right-1 -top-1 rounded-full bg-tier-s px-1 py-px text-[9px] font-bold uppercase leading-tight text-white">
          new
        </span>
      </Button>

      {/*
        * Saving a picture, copying the link, fetching an embed code: three
        * things done once and then not again for weeks, which between them
        * were taking three fifths of a toolbar away from the two actions
        * somebody actually comes here for.
        */}
      <OverflowMenu
        label="More list actions"
        items={[
          {
            label: exporting ? "Rendering…" : "Download PNG",
            icon: Download,
            onSelect: () => void handleExport(),
            disabled: exporting,
          },
          { label: "Copy link", icon: Share2, onSelect: () => void handleShare() },
          // Only offered once the board is public: the widget reads the same
          // page a visitor would, so on a closed profile it renders nothing.
          ...(shareHandle
            ? [
                {
                  label: "OBS widget",
                  icon: MonitorPlay,
                  onSelect: () => setWidgetOpen(true),
                },
              ]
            : []),
          // Destructive and infrequent, like the export and the link above it,
          // but not one of them: this empties the list rather than doing
          // something to it, so it gets its own tint and sits last.
          ...(clearableCount > 0
            ? [
                {
                  label: "Clear list",
                  icon: Eraser,
                  onSelect: handleClearList,
                  destructive: true,
                },
              ]
            : []),
        ]}
      />

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
