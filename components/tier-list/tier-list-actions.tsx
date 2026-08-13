"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UsernameDialog } from "@/components/profile/username-dialog";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { getMyProfile, type Profile } from "@/lib/supabase/profiles";

interface TierListActionsProps {
  /** The element to rasterise — the tier rows only, without the toolbar. */
  boardRef: React.RefObject<HTMLElement | null>;
  onNotify: (message: string) => void;
}

export function TierListActions({ boardRef, onNotify }: TierListActionsProps) {
  const { user } = useSupabaseSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

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
      const url = `${window.location.origin}/u/${handle}`;
      try {
        await navigator.clipboard.writeText(url);
        onNotify("Ссылка скопирована!");
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

    setExporting(true);
    // The watermark sits in the DOM at zero opacity so it never disturbs the
    // live layout; it is only made visible for the duration of the capture.
    const watermark = node.querySelector<HTMLElement>("[data-export-watermark]");
    if (watermark) watermark.style.opacity = "1";

    try {
      // Imported here rather than at module scope: the library is only needed
      // the moment someone actually exports, and it is far from small.
      const { toPng } = await import("html-to-image");

      const render = toPng(node, {
        // The board is transparent by design, so without this the PNG comes out
        // with a see-through background that reads as black in most viewers.
        backgroundColor: "#09090b",
        // Two-times scale keeps the poster art crisp without ballooning the file.
        pixelRatio: 2,
        // Controls are hidden for the shot via the data attribute below.
        filter: (el) => !(el instanceof HTMLElement && el.dataset.exportHide !== undefined),
        // Without this the library walks every stylesheet and inlines each web
        // font as a data URI before it will rasterise anything — on a slow link
        // that step alone can outlast the user's patience, and it buys nothing
        // here because the export is a picture of posters, not of typography.
        skipFonts: true,
      });

      // A stalled capture must not leave the button disabled forever.
      const dataUrl = await Promise.race([
        render,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("export-timeout")), 20_000)
        ),
      ]);

      const link = document.createElement("a");
      link.download = `cinetier-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      onNotify("Изображение сохранено");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      onNotify(
        reason === "export-timeout"
          ? "Изображение не успело сформироваться. Попробуйте ещё раз."
          : `Не удалось создать изображение: ${reason.slice(0, 120)}`
      );
    } finally {
      if (watermark) watermark.style.opacity = "0";
      setExporting(false);
    }
  }, [boardRef, onNotify]);

  const handleShare = useCallback(() => {
    if (shareHandle) {
      void copyLink(shareHandle);
      return;
    }
    if (user) {
      // No handle yet — take the claim inline instead of sending them away.
      setDialogOpen(true);
      return;
    }
    onNotify("Войдите, чтобы получить ссылку на свой тир-лист");
  }, [shareHandle, user, copyLink, onNotify]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden />
        )}
        Скачать PNG
      </Button>

      <Button variant="secondary" size="sm" onClick={handleShare}>
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        Скопировать ссылку
      </Button>

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
