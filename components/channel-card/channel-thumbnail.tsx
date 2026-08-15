import Image from "next/image";
import { SquarePlay } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ChannelThumbnailProps {
  thumbnailUrl: string | null;
  title: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export function ChannelThumbnail({
  thumbnailUrl,
  title,
  className,
  priority,
  sizes,
}: ChannelThumbnailProps) {
  if (!thumbnailUrl) {
    return (
      <div
        className={cn(
          "flex aspect-square items-center justify-center rounded-full border border-border bg-surface-raised text-muted",
          className
        )}
      >
        <SquarePlay className="h-1/2 w-1/2" aria-hidden />
        <span className="sr-only">{title} (avatar unavailable)</span>
      </div>
    );
  }

  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-full bg-surface-raised", className)}>
      <Image
        src={thumbnailUrl}
        alt={`${title} channel avatar`}
        fill
        sizes={sizes ?? "(max-width: 640px) 33vw, 120px"}
        className="object-cover"
        priority={priority}
      />
    </div>
  );
}
