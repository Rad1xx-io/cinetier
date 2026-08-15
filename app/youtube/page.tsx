import { Suspense } from "react";
import { YouTubeDiscoverClient } from "@/components/youtube-search/youtube-discover-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "YouTube channels — TierListOnline",
};

export default function YouTubePage() {
  return (
    <Suspense fallback={<YouTubeFallback />}>
      <YouTubeDiscoverClient />
    </Suspense>
  );
}

function YouTubeFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-full" />
        ))}
      </div>
    </div>
  );
}
