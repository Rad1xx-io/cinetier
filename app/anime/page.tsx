import { Suspense } from "react";
import { AnimeDiscoverClient } from "@/components/anime-search/anime-discover-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Аниме — CineTier",
};

export default function AnimePage() {
  return (
    <Suspense fallback={<AnimeFallback />}>
      <AnimeDiscoverClient />
    </Suspense>
  );
}

function AnimeFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-2/3" />
        ))}
      </div>
    </div>
  );
}
