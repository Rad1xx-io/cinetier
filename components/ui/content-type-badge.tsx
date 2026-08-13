import { contentTypeAccent, type ContentType } from "@/lib/utils/content-type";
import { cn } from "@/lib/utils/cn";

interface ContentTypeBadgeProps {
  type: ContentType;
  className?: string;
}

/**
 * Colour-coded marker of which catalog a card came from. Its job is to be
 * readable at a glance in the tier list, where all four types sit side by side.
 */
export function ContentTypeBadge({ type, className }: ContentTypeBadgeProps) {
  const accent = contentTypeAccent(type);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        accent.badge,
        className
      )}
    >
      {accent.label}
    </span>
  );
}
