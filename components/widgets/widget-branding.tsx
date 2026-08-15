import Link from "next/link";
import { Clapperboard } from "lucide-react";
import type { WidgetTheme } from "@/lib/widgets/params";
import { cn } from "@/lib/utils/cn";

interface WidgetBrandingProps {
  /** The public handle whose board this is. */
  listId: string;
  theme: WidgetTheme;
  className?: string;
}

/**
 * The corner credit.
 *
 * Deliberately quiet: this sits on someone's broadcast, and a badge that
 * competes with their content is a badge they crop out of the source. Legible
 * on a stream frame it cannot predict, hence the backdrop behind it — the
 * transparent theme has whatever the streamer is playing behind the text.
 */
export function WidgetBranding({ listId, theme, className }: WidgetBrandingProps) {
  return (
    <Link
      href={`/u/${listId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-tight backdrop-blur-sm transition-opacity hover:opacity-100",
        theme === "light"
          ? "bg-black/5 text-black/55"
          : "bg-black/35 text-white/65",
        "opacity-80",
        className
      )}
    >
      <Clapperboard className="h-2.5 w-2.5 shrink-0" aria-hidden />
      Powered by CineTier
    </Link>
  );
}
