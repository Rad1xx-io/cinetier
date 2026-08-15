import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChannelDetailsError() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <TriangleAlert className="h-10 w-10 text-tier-s" aria-hidden />
      <h1 className="text-lg font-semibold">Could not load this channel</h1>
      <p className="text-sm text-muted">YouTube may be temporarily unavailable. Please try again shortly.</p>
      <Button asChild variant="secondary">
        <Link href="/youtube">Back to search</Link>
      </Button>
    </div>
  );
}
