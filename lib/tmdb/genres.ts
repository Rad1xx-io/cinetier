import "server-only";
import { tmdbFetch } from "@/lib/tmdb/client";

interface RawGenreList {
  genres: { id: number; name: string }[];
}

/**
 * One filter option covering both catalogs.
 *
 * TMDB keeps separate genre vocabularies per media type and the ids do not line
 * up — "Action" is 28 for films but folded into "Action & Adventure" (10759)
 * for series. Matching on the name lets a single dropdown entry carry whichever
 * id each endpoint actually expects, so the "All" tab can query films and
 * series together instead of silently filtering one of them wrong.
 */
export interface GenreOption {
  /** Stable url-safe key; what travels in the query string. */
  slug: string;
  label: string;
  movieId?: number;
  tvId?: number;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

/**
 * Series genres that exist under a different name on the film side. Without
 * these, picking "Action" would quietly drop every series from the results.
 */
const TV_EQUIVALENTS: Record<string, string[]> = {
  "action & adventure": ["action", "adventure"],
  "sci-fi & fantasy": ["science fiction", "fantasy"],
  "war & politics": ["war"],
};

let cached: GenreOption[] | null = null;
let pending: Promise<GenreOption[]> | null = null;

export async function getGenreVocabulary(): Promise<GenreOption[]> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const [movies, tv] = await Promise.all([
      tmdbFetch<RawGenreList>("/genre/movie/list"),
      tmdbFetch<RawGenreList>("/genre/tv/list"),
    ]);

    const byLabel = new Map<string, GenreOption>();

    for (const g of movies.genres) {
      const key = g.name.toLowerCase();
      byLabel.set(key, { slug: slugify(g.name), label: g.name, movieId: g.id });
    }

    for (const g of tv.genres) {
      const key = g.name.toLowerCase();
      const existing = byLabel.get(key);
      if (existing) {
        existing.tvId = g.id;
        continue;
      }
      // A combined series genre attaches its id to each film genre it covers,
      // rather than becoming a separate option nobody recognises.
      const equivalents = TV_EQUIVALENTS[key];
      if (equivalents) {
        for (const name of equivalents) {
          const target = byLabel.get(name);
          if (target) target.tvId = g.id;
        }
        continue;
      }
      byLabel.set(key, { slug: slugify(g.name), label: g.name, tvId: g.id });
    }

    cached = [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, "en"));
    return cached;
  })().finally(() => {
    pending = null;
  });

  return pending;
}

export async function findGenre(slug: string): Promise<GenreOption | undefined> {
  return (await getGenreVocabulary()).find((g) => g.slug === slug);
}
