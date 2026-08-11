import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TitleDetailsError() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <TriangleAlert className="h-10 w-10 text-tier-s" aria-hidden />
      <h1 className="text-lg font-semibold">Не удалось загрузить этот тайтл</h1>
      <p className="text-sm text-muted">TMDB может быть временно недоступен. Попробуйте ещё раз чуть позже.</p>
      <Button asChild variant="secondary">
        <Link href="/discover">Назад к поиску</Link>
      </Button>
    </div>
  );
}
