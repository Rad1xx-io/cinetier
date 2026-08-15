"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, MonitorPlay, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWidgetUrl, WIDGET_DEFAULTS, type WidgetTheme } from "@/lib/widgets/params";
import { trackLinkCopied } from "@/lib/analytics/events";
import { cn } from "@/lib/utils/cn";

interface WidgetEmbedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The public handle the widget will render. */
  listId: string;
}

const THEMES: { value: WidgetTheme; label: string }[] = [
  { value: "transparent", label: "Transparent" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export function WidgetEmbedDialog({ isOpen, onClose, listId }: WidgetEmbedDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [theme, setTheme] = useState<WidgetTheme>(WIDGET_DEFAULTS.theme);
  const [compact, setCompact] = useState(WIDGET_DEFAULTS.compact);
  const [showTitle, setShowTitle] = useState(WIDGET_DEFAULTS.showTitle);
  const [limit, setLimit] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    if (!isOpen && el.open) el.close();
  }, [isOpen]);

  // The origin is only knowable in the browser, and the URL is worthless
  // without it — so it is read at render rather than guessed at build time.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = buildWidgetUrl(origin, listId, { theme, compact, showTitle, limit });

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackLinkCopied("tier_list", listId);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the field below is selectable, so the
      // streamer still has a way to take the URL.
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[92dvh] w-[min(34rem,94vw)] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <MonitorPlay className="h-4 w-4 text-accent" aria-hidden />
              OBS widget
            </h2>
            <p className="mt-1 text-xs text-muted">
              Add the link as a Browser Source and the board appears over your stream.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">Background</span>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
              {THEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  aria-pressed={theme === option.value}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    theme === option.value
                      ? "bg-accent text-accent-foreground"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Compact mode — smaller posters, tighter spacing
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showTitle}
              onChange={(e) => setShowTitle(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Show the author’s name
          </label>

          <label className="flex flex-wrap items-center gap-2 text-xs">
            Show only the top
            <input
              type="number"
              min={1}
              max={6}
              value={limit ?? ""}
              placeholder="all"
              onChange={(e) => {
                const next = Number(e.target.value);
                setLimit(Number.isFinite(next) && next >= 1 ? next : null);
              }}
              aria-label="How many tiers to show"
              className="h-8 w-16 rounded-lg border border-border bg-surface-raised px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            tier(s)
          </label>
        </div>

        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-medium text-muted">Link</span>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Widget link"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <Button size="sm" onClick={handleCopy} className="shrink-0">
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-medium text-muted">Preview</span>
          {/* A real iframe of the real URL: the point of a preview here is to
              show what OBS will show, and a mock-up would drift from it. The
              checkerboard stands in for the stream behind a transparent theme. */}
          <div
            className="overflow-hidden rounded-lg border border-border"
            style={{
              backgroundColor: "#2a2a30",
              backgroundImage:
                "linear-gradient(45deg, #1e1e22 25%, transparent 25%, transparent 75%, #1e1e22 75%), linear-gradient(45deg, #1e1e22 25%, transparent 25%, transparent 75%, #1e1e22 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 8px 8px",
            }}
          >
            {isOpen && origin && (
              <iframe
                key={url}
                src={url}
                title="Widget preview"
                className="h-64 w-full border-0"
              />
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            The widget reads your public page — it shows the board only while your profile is open.
          </p>
        </div>
      </div>
    </dialog>
  );
}
