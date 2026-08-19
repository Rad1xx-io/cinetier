"use client";

import { useState } from "react";
import Image from "next/image";
import { Clapperboard } from "lucide-react";
import { posterUrl, type PosterSize } from "@/lib/utils/tmdb-image";
import { isUnoptimizedSource } from "@/lib/utils/image-source";
import { cn } from "@/lib/utils/cn";

interface PosterProps {
  posterPath: string | null;
  title: string;
  size?: PosterSize;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /**
   * Tried when the main image fails to load. Steam builds its portrait library
   * art lazily and genuinely 404s it for a slice of the catalog, so games pass
   * their store capsule here rather than dropping straight to a placeholder.
   */
  fallbackSrc?: string | null;
}

export function Poster({
  posterPath,
  title,
  size = "w342",
  className,
  priority,
  sizes,
  fallbackSrc,
}: PosterProps) {
  const candidates = [posterUrl(posterPath, size), fallbackSrc].filter(
    (src): src is string => Boolean(src)
  );
  const [attempt, setAttempt] = useState(0);
  const src = candidates[attempt];

  // Nothing left to try — name the title instead of showing a broken image.
  if (!src) {
    return (
      <div
        className={cn(
          // `overflow-hidden` is what actually contains the label: a title with
          // no spaces has no break opportunity, so `overflow-wrap` alone lets
          // the span size itself to the text and stretch the whole board.
          "flex aspect-2/3 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-border bg-surface-raised p-2 text-center text-muted",
          className
        )}
      >
        <Clapperboard className="h-6 w-6 shrink-0" aria-hidden />
        <span className="line-clamp-3 w-full break-all text-[10px] leading-tight">{title}</span>
      </div>
    );
  }

  return (
    <div className={cn("relative aspect-2/3 overflow-hidden rounded-lg bg-surface-raised", className)}>
      <Image
        key={src}
        src={src}
        alt={`${title} poster`}
        fill
        sizes={sizes ?? "(max-width: 640px) 33vw, 180px"}
        className="object-cover"
        priority={priority}
        unoptimized={isUnoptimizedSource(src)}
        onError={() => setAttempt((i) => i + 1)}
      />
    </div>
  );
}
