import Image from "next/image";
import { Clapperboard } from "lucide-react";
import { posterUrl, type PosterSize } from "@/lib/utils/tmdb-image";
import { cn } from "@/lib/utils/cn";

interface PosterProps {
  posterPath: string | null;
  title: string;
  size?: PosterSize;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export function Poster({ posterPath, title, size = "w342", className, priority, sizes }: PosterProps) {
  const src = posterUrl(posterPath, size);

  if (!src) {
    return (
      <div
        className={cn(
          "flex aspect-2/3 items-center justify-center rounded-lg border border-border bg-surface-raised text-muted",
          className
        )}
      >
        <Clapperboard className="h-8 w-8" aria-hidden />
        <span className="sr-only">{title} (постер недоступен)</span>
      </div>
    );
  }

  return (
    <div className={cn("relative aspect-2/3 overflow-hidden rounded-lg bg-surface-raised", className)}>
      <Image
        src={src}
        alt={`${title} poster`}
        fill
        sizes={sizes ?? "(max-width: 640px) 33vw, 180px"}
        className="object-cover"
        priority={priority}
      />
    </div>
  );
}
