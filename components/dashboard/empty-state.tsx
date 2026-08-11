import Link from "next/link";
import { Clapperboard, Compass, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-surface px-6 py-16 text-center animate-fade-in">
      <Clapperboard className="h-12 w-12 text-accent" aria-hidden />
      <div>
        <h2 className="text-xl font-semibold">Здесь пока пусто</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Добавь фильмы или сериалы через Поиск, а затем перетащи их в тиры от S до F, чтобы
          построить свой личный рейтинг.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/discover?type=movie">
            <Clapperboard className="h-4 w-4" aria-hidden />
            Найти фильмы
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/discover?type=tv">
            <Tv className="h-4 w-4" aria-hidden />
            Найти сериалы
          </Link>
        </Button>
      </div>
      <Link href="/discover" className="flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <Compass className="h-3.5 w-3.5" aria-hidden />
        Или посмотреть всё в Поиске
      </Link>
    </div>
  );
}
