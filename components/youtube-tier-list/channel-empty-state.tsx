import Link from "next/link";
import { SquarePlay } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChannelEmptyState() {
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-surface px-6 py-16 text-center animate-fade-in">
      <SquarePlay className="h-12 w-12 text-accent" aria-hidden />
      <div>
        <h2 className="text-xl font-semibold">Nothing here yet</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Find YouTube channels through search, then drag them into tiers from S down to F to build
          your ranking.
        </p>
      </div>
      <Button asChild>
        <Link href="/youtube">
          <SquarePlay className="h-4 w-4" aria-hidden />
          Find channels
        </Link>
      </Button>
    </div>
  );
}
