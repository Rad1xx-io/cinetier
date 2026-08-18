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

/** Stands in for a cover the browser could not fetch. 1x1, fully transparent. */
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** The board is transparent by design; the export paints this behind it. */
const BOARD_BACKGROUND = "#09090b";

/** Retina-ish scale for the poster art. */
const EXPORT_SCALE = 2;

/**
 * Browsers stop honouring a canvas past roughly this on a side and return a
 * blank one, so a very tall board is scaled down rather than exported empty.
 */
const MAX_CANVAS_SIDE = 16_384;

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
    if (!node) return;

    const itemsCount = titles.length + channels.length;

    setExporting(true);
    // The watermark sits in the DOM at zero opacity so it never disturbs the
    // live layout; it is only made visible for the duration of the capture.
    const watermark = node.querySelector<HTMLElement>("[data-export-watermark]");
    if (watermark) watermark.style.opacity = "1";

    try {
      // Imported here rather than at module scope: the library is only needed
      // the moment someone actually exports, and it is far from small.
      const { toSvg } = await import("html-to-image");

      /*
       * toPng is deliberately not used.
       *
       * It ends in the library's own `createImage`, which resolves inside a
       * requestAnimationFrame — and a tab that is not compositing (switched
       * away, or a window fully covered by another) is never given a frame, so
       * that promise never settles and the export dies on the timeout below
       * with nothing to show for it. Measured on this board: everything up to
       * the SVG finishes in about 80ms, then toPng waits forever.
       *
       * What follows is what the library's toCanvas does, minus that frame.
       */
      const render = (async () => {
        const svg = await toSvg(node, {
          backgroundColor: BOARD_BACKGROUND,
          // Controls are hidden for the shot via the data attribute below.
          filter: (el) => !(el instanceof HTMLElement && el.dataset.exportHide !== undefined),
          /*
           * One cover that will not load must not cost the whole board.
           *
           * The library inlines every image as a data URI before it rasterises
           * anything. When a fetch fails — TMDB genuinely 404s a few posters,
           * and the optimiser answers a burst of parallel requests with rate
           * limits — it falls back to this placeholder, and without one it
           * assigns an empty src instead, which fires an error event that
           * rejects the entire export. `onImageErrorHandler` catches the same
           * thing one step later, for an image that loads to something the
           * browser then refuses to decode.
           */
          imagePlaceholder: TRANSPARENT_PIXEL,
          onImageErrorHandler: () => {},
          /*
           * Every cover on the board is one `/_next/image` request, and they
           * differ only in the query. The library caches what it inlines, and
           * its key drops the query unless this is set — so all of them share
           * one entry. Within a single export the fetches start together and
           * each card still gets its own picture, but the entry keeps whichever
           * finished last, and the *next* export in the same tab hands that one
           * image to every card. Filters looked like the trigger only because
           * changing one is what makes somebody export twice.
           */
          includeQueryParams: true,
          // Without this the library walks every stylesheet and inlines each web
          // font as a data URI before it will rasterise anything — on a slow link
          // that step alone can outlast the user's patience, and it buys nothing
          // here because the export is a picture of posters, not of typography.
          skipFonts: true,
        });

        const image = new Image();
        image.decoding = "async";
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("the board could not be rasterised"));
          image.src = svg;
        });

        // The SVG carries the size the library measured, so the canvas takes it
        // from the image rather than measuring the board a second time.
        const width = image.naturalWidth || node.clientWidth;
        const height = image.naturalHeight || node.clientHeight;
        // Two-times scale keeps the poster art crisp. Browsers refuse a canvas
        // past roughly 16k on a side and hand back a blank one instead, so a
        // very tall board is scaled down rather than exported empty.
        const scale = Math.min(EXPORT_SCALE, MAX_CANVAS_SIDE / Math.max(width, height));

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(width * scale);
        canvas.height = Math.floor(height * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("this browser offered no canvas to draw on");

        // The board is transparent by design, so without this the PNG comes out
        // see-through, which reads as black in most viewers.
        context.fillStyle = BOARD_BACKGROUND;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL();
      })();

      // A stalled capture must not leave the button disabled forever.
      const dataUrl = await Promise.race([
        render,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("export-timeout")), 20_000)
        ),
      ]);

      const link = document.createElement("a");
      link.download = `tierlistonline-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
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
