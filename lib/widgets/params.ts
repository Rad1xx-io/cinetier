import { TIER_ORDER } from "@/lib/types";

export type WidgetTheme = "dark" | "light" | "transparent";

export interface WidgetParams {
  theme: WidgetTheme;
  compact: boolean;
  showTitle: boolean;
  /** How many tiers from the top to show. Null means all of them. */
  limit: number | null;
}

export const WIDGET_DEFAULTS: WidgetParams = {
  // Transparent by default: the widget's job is to sit over a stream, and a
  // painted panel is the thing a streamer would have to undo first.
  theme: "transparent",
  compact: false,
  showTitle: true,
  limit: null,
};

const THEMES: WidgetTheme[] = ["dark", "light", "transparent"];

/** Query values arrive as strings; anything but an explicit "true" is false. */
function parseBool(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

/**
 * Reads widget options off the URL.
 *
 * Every value falls back to its default rather than erroring: this URL is typed
 * by hand into OBS, often on a second monitor mid-stream, and a typo should cost
 * one option — not the whole overlay.
 */
export function parseWidgetParams(
  source: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined
): WidgetParams {
  const get = (key: string): string | null => {
    if (!source) return null;
    if (source instanceof URLSearchParams) return source.get(key);
    const value = source[key];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  };

  const rawTheme = get("theme")?.trim().toLowerCase();
  const theme = THEMES.includes(rawTheme as WidgetTheme)
    ? (rawTheme as WidgetTheme)
    : WIDGET_DEFAULTS.theme;

  const rawLimit = get("limit");
  const parsedLimit = rawLimit === null || rawLimit.trim() === "" ? NaN : Number(rawLimit);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit >= 1
      ? Math.min(Math.floor(parsedLimit), TIER_ORDER.length)
      : WIDGET_DEFAULTS.limit;

  return {
    theme,
    compact: parseBool(get("compact"), WIDGET_DEFAULTS.compact),
    showTitle: parseBool(get("showTitle"), WIDGET_DEFAULTS.showTitle),
    limit,
  };
}

/**
 * Builds the URL a streamer pastes into OBS.
 *
 * Only non-default options are written, so the common case is a clean link and
 * what is in the query is exactly what was deliberately changed.
 */
export function buildWidgetUrl(origin: string, listId: string, params: Partial<WidgetParams>): string {
  const search = new URLSearchParams();
  if (params.theme && params.theme !== WIDGET_DEFAULTS.theme) search.set("theme", params.theme);
  if (params.compact) search.set("compact", "true");
  if (params.showTitle === false) search.set("showTitle", "false");
  if (params.limit != null) search.set("limit", String(params.limit));

  const query = search.toString();
  const base = `${origin.replace(/\/$/, "")}/widgets/tier-list/${encodeURIComponent(listId)}`;
  return query ? `${base}?${query}` : base;
}
